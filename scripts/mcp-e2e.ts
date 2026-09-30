/* eslint-disable @typescript-eslint/no-explicit-any -- test script reading loosely-typed JSON */
/**
 * End-to-end test of the AI connector: OAuth discovery, client registration (DCR and
 * CIMD), consent, token exchange, every MCP tool, scope enforcement, code/refresh
 * reuse detection and revocation. Runs against the Firebase emulators with the seeded
 * demo store and a production build whose NEXT_PUBLIC_SITE_URL equals E2E_BASE_URL:
 *
 *   npm run emulators                     # terminal 1 (seeded demo data)
 *   NEXT_PUBLIC_SITE_URL=http://localhost:3100 npx next build && \
 *   NEXT_PUBLIC_SITE_URL=http://localhost:3100 npx next start -p 3100   # terminal 2
 *   E2E_BASE_URL=http://localhost:3100 npx tsx scripts/mcp-e2e.ts
 */
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3100").replace(/\/+$/, "");
const MCP = `${BASE}/mcp`;
const FIRESTORE = "http://127.0.0.1:8080/v1/projects/demo-catalog-quote/databases/(default)/documents";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const REDIRECT = "http://localhost/callback";

let failures = 0;
function check(condition: unknown, label: string, detail?: unknown) {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail !== undefined ? `\n       ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
  }
}

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function pkce() {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}

async function json(res: Response) {
  return (await res.json().catch(() => ({}))) as Record<string, any>;
}

async function idToken(email: string, password: string) {
  const res = await fetch(`${AUTH}/accounts:signInWithPassword?key=demo-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  return String((await json(res)).idToken);
}

async function adminFs(method: string, path: string, body?: unknown) {
  const res = await fetch(`${FIRESTORE}/${path}`, {
    method,
    headers: { authorization: "Bearer owner", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return json(res);
}

function authorizeQuery(clientId: string, challenge: string, extra: Record<string, string> = {}) {
  return new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT.replace("localhost", "localhost:43123"),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "state-123",
    scope: "catalog:read catalog:write quotes:read quotes:write offline_access",
    resource: MCP,
    ...extra,
  });
}

async function approve(clientId: string, challenge: string, token: string, storeIds: string[], allowChanges: boolean) {
  const params = Object.fromEntries(authorizeQuery(clientId, challenge).entries());
  const res = await fetch(`${BASE}/api/oauth/authorize`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ decision: "allow", params, storeIds, allowChanges }),
  });
  return json(res);
}

async function tokenRequest(form: Record<string, string>) {
  const res = await fetch(`${BASE}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  return { status: res.status, body: await json(res) };
}

async function mcpClient(accessToken: string, mode: "legacy" | "auto" = "auto") {
  const client = new Client({ name: "e2e", version: "1.0.0" }, { versionNegotiation: { mode } });
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP), { authProvider: { token: async () => accessToken } }));
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  try {
    const result = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text?: string }[] };
    const text = result.content?.[0]?.text ?? "";
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {}
    return { isError: Boolean(result.isError), text, data, thrown: null as string | null };
  } catch (err) {
    return { isError: true, text: "", data: null, thrown: `${(err as Error).name}: ${(err as Error).message}` };
  }
}

function rawStatus(path: string, host: string): Promise<number> {
  const url = new URL(BASE + path);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: url.hostname, port: url.port, path: url.pathname, method: "POST", headers: { host, "content-type": "application/json" } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end("{}");
  });
}

async function main() {
  console.log(`Testing ${MCP}\n\n# discovery`);
  const challengeRes = await fetch(MCP, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
  const www = challengeRes.headers.get("www-authenticate") ?? "";
  check(challengeRes.status === 401, "unauthenticated /mcp returns 401", challengeRes.status);
  check(www.includes(`resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp"`), "401 points at path-aware resource metadata", www);
  check(www.includes("catalog:write") && www.includes("quotes:write"), "401 asks for every scope", www);

  const prm = await json(await fetch(`${BASE}/.well-known/oauth-protected-resource/mcp`));
  const prmRoot = await json(await fetch(`${BASE}/.well-known/oauth-protected-resource`));
  check(prm.resource === MCP && prm.authorization_servers?.[0] === BASE, "protected resource metadata", prm);
  check(prmRoot.resource === MCP, "root protected resource metadata fallback", prmRoot);
  const as = await json(await fetch(`${BASE}/.well-known/oauth-authorization-server`));
  check(as.issuer === BASE && as.client_id_metadata_document_supported === true && as.token_endpoint_auth_methods_supported?.includes("none"), "AS metadata advertises CIMD + public clients", as);
  check(as.code_challenge_methods_supported?.includes("S256") && as.authorization_response_iss_parameter_supported === true, "AS metadata advertises S256 and iss", as);

  console.log("\n# setup");
  const ownerToken = await idToken("demo@example.com", "demo1234");
  check(ownerToken.length > 100, "demo owner signed in on the auth emulator");
  const slug = await adminFs("GET", "slugs/jr-demo");
  const storeId = String(slug.fields?.storeId?.stringValue ?? "");
  check(storeId, "found the demo store", slug);
  const store = await adminFs("GET", `stores/${storeId}`);
  const ownerUid = String(store.fields?.ownerId?.stringValue ?? "");
  // A second store owned by the same user, NOT granted to the connection.
  await adminFs("PATCH", "stores/e2e-other-store", {
    fields: { ownerId: { stringValue: ownerUid }, name: { stringValue: "E2E Other" }, slug: { stringValue: "e2e-other" }, quotePrefix: { stringValue: "EO" }, quoteCounter: { integerValue: "1000" } },
  });
  await adminFs("PATCH", "slugs/e2e-other", { fields: { storeId: { stringValue: "e2e-other-store" } } });

  console.log("\n# dynamic client registration");
  const reg = await fetch(`${BASE}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "E2E Client", redirect_uris: [REDIRECT], grant_types: ["authorization_code", "refresh_token"] }),
  });
  const client = await json(reg);
  check(reg.status === 201 && String(client.client_id).startsWith("dcr_") && client.token_endpoint_auth_method === "none", "DCR registers a public client", client);
  const badReg = await fetch(`${BASE}/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: ["http://evil.example/cb"] }) });
  check(badReg.status === 400, "DCR rejects non-loopback http redirect URIs", badReg.status);
  const clientId = String(client.client_id);

  console.log("\n# authorization request validation");
  const p1 = pkce();
  const view = await json(await fetch(`${BASE}/api/oauth/authorize?${authorizeQuery(clientId, p1.challenge)}`));
  check(view.ok === true && view.view?.clientName === "E2E Client" && view.view?.loopbackOnly === true, "consent view for a loopback DCR client (any port)", view);
  const wrongRedirect = await json(await fetch(`${BASE}/api/oauth/authorize?${authorizeQuery(clientId, p1.challenge, { redirect_uri: "https://evil.example/cb" })}`));
  check(wrongRedirect.ok === false && wrongRedirect.kind === "show", "unregistered redirect_uri is shown, never redirected to", wrongRedirect);
  const noPkce = await json(await fetch(`${BASE}/api/oauth/authorize?${authorizeQuery(clientId, p1.challenge, { code_challenge_method: "plain" })}`));
  check(noPkce.kind === "redirect" && String(noPkce.redirectTo).includes("error=invalid_request") && String(noPkce.redirectTo).includes(`iss=${encodeURIComponent(BASE)}`), "missing S256 PKCE redirects with error and iss", noPkce);
  const wrongResource = await json(await fetch(`${BASE}/api/oauth/authorize?${authorizeQuery(clientId, p1.challenge, { resource: "https://evil.example/mcp" })}`));
  check(String(wrongResource.redirectTo).includes("error=invalid_target"), "wrong resource is rejected", wrongResource);
  const claude = new URLSearchParams({ response_type: "code", client_id: "https://claude.ai/oauth/mcp-oauth-client-metadata", redirect_uri: "https://claude.ai/api/mcp/auth_callback", code_challenge: p1.challenge, code_challenge_method: "S256", resource: MCP });
  const claudeView = await json(await fetch(`${BASE}/api/oauth/authorize?${claude}`));
  check(claudeView.ok === true && claudeView.view?.verifiedHost === "claude.ai" && claudeView.view?.clientName === "Claude" && claudeView.view?.trusted === true, "Claude's client metadata document is fetched and trusted", claudeView);
  const ipLiteral = await json(await fetch(`${BASE}/api/oauth/authorize?${new URLSearchParams({ ...Object.fromEntries(claude), client_id: "https://[::ffff:7f00:1]/x" })}`));
  check(ipLiteral.kind === "show" && !String(ipLiteral.description).includes("ECONN"), "IP-literal client metadata URLs are refused without leaking network details", ipLiteral);
  const badScheme = await fetch(`${BASE}/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: ["ms-msdt:/id x"] }) });
  check(badScheme.status === 400, "dangerous app schemes are refused at registration", badScheme.status);
  const loginHeaders = await fetch(`${BASE}/login`);
  check(loginHeaders.headers.get("x-frame-options") === "DENY" && String(loginHeaders.headers.get("content-security-policy")).includes("frame-ancestors 'none'"), "every page refuses to be framed", Object.fromEntries(loginHeaders.headers));
  const claudeCode = new URLSearchParams({ response_type: "code", client_id: "https://claude.ai/oauth/claude-code-client-metadata", redirect_uri: "http://localhost:51888/callback", code_challenge: p1.challenge, code_challenge_method: "S256", resource: MCP });
  const ccView = await json(await fetch(`${BASE}/api/oauth/authorize?${claudeCode}`));
  check(ccView.ok === true && ccView.view?.clientName === "Claude Code", "Claude Code's loopback redirect matches on any port", ccView);
  const badStores = await approve(clientId, p1.challenge, ownerToken, ["not-my-store"], false);
  check(badStores.error === "invalid_stores", "cannot grant a store you don't own", badStores);
  const noAuth = await fetch(`${BASE}/api/oauth/authorize`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "allow", params: Object.fromEntries(authorizeQuery(clientId, p1.challenge)), storeIds: [storeId], allowChanges: true }) });
  check(noAuth.status === 401, "approving requires the owner's sign-in", noAuth.status);

  console.log("\n# read-only connection");
  const ro = await approve(clientId, p1.challenge, ownerToken, [storeId], false);
  const roRedirect = new URL(String(ro.redirectTo));
  check(roRedirect.searchParams.get("state") === "state-123" && roRedirect.searchParams.get("iss") === BASE && roRedirect.port === "43123", "approval redirects to the exact redirect URI with code, state and iss", ro);
  const roCode = String(roRedirect.searchParams.get("code"));
  const badVerifier = await tokenRequest({ grant_type: "authorization_code", code: roCode, client_id: clientId, redirect_uri: "http://localhost:43123/callback", code_verifier: pkce().verifier, resource: MCP });
  check(badVerifier.status === 400 && badVerifier.body.error === "invalid_grant", "wrong PKCE verifier is rejected", badVerifier);
  const roTokens = await tokenRequest({ grant_type: "authorization_code", code: roCode, client_id: clientId, redirect_uri: "http://localhost:43123/callback", code_verifier: p1.verifier, resource: MCP });
  check(roTokens.status === 200 && roTokens.body.token_type === "Bearer" && roTokens.body.scope === "catalog:read quotes:read" && roTokens.body.refresh_token, "code exchange issues read-only tokens", roTokens);
  const roClient = await mcpClient(roTokens.body.access_token, "legacy");
  const tools = await roClient.listTools();
  check(tools.tools.length === 5 && !tools.tools.some((t) => t.name.startsWith("create_") || t.name.startsWith("update_")), "a read-only connection only sees the 5 read tools", tools.tools.map((t) => t.name));
  const stores = await call(roClient, "list_stores");
  check(Array.isArray(stores.data) && stores.data.length === 1 && stores.data[0].id === storeId, "list_stores shows only the granted store", stores);
  const catalog = await call(roClient, "get_catalog", { store: "jr-demo" });
  check(catalog.data?.categories?.length >= 4, "get_catalog works with the store slug", catalog.text.slice(0, 200));
  const other = await call(roClient, "get_catalog", { store: "e2e-other" });
  check(other.isError && other.text.includes("not available"), "a store not granted is refused", other);
  const quotes = await call(roClient, "list_quotes", { store: storeId, limit: 5 });
  check(Array.isArray(quotes.data) && quotes.data.length >= 1, "list_quotes works", quotes.text.slice(0, 200));
  const write = await call(roClient, "create_category", { store: storeId, name: "Should fail" });
  check(write.isError, "write tools can't be called on a read-only connection", write);
  const slashRef = await call(roClient, "get_catalog", { store: "/jr-demo" });
  const urlRef = await call(roClient, "get_catalog", { store: `${BASE}/jr-demo`, categoryId: catalog.data.categories[0].id });
  check(!slashRef.isError && urlRef.data?.categories?.length === 1, "store refs like /jr-demo or the public URL work; categoryId filters", [slashRef.text.slice(0, 80), urlRef.text.slice(0, 120)]);
  const badRef = await call(roClient, "get_item", { store: storeId, itemId: "a/../b" });
  check(badRef.isError && !badRef.text.includes("Something went wrong"), "malformed ids get a clear validation error", badRef);
  await roClient.close();
  const strangerReplay = await tokenRequest({ grant_type: "authorization_code", code: roCode, client_id: "dcr_someone_else_xxxxxxxxxxxxxxxxxxxx", redirect_uri: "https://x.example/", code_verifier: pkce().verifier });
  const stillWorks = await fetch(MCP, { method: "POST", headers: { authorization: `Bearer ${roTokens.body.access_token}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  check(strangerReplay.body.error === "invalid_grant" && stillWorks.status === 200, "a spent code replayed by someone else can't disconnect the owner", [strangerReplay, stillWorks.status]);
  const reuse = await tokenRequest({ grant_type: "authorization_code", code: roCode, client_id: clientId, redirect_uri: "http://localhost:43123/callback", code_verifier: p1.verifier, resource: MCP });
  check(reuse.body.error === "invalid_grant", "a reused code is rejected", reuse);
  const afterReuse = await fetch(MCP, { method: "POST", headers: { authorization: `Bearer ${roTokens.body.access_token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  check(afterReuse.status === 401, "code reuse revokes tokens already issued from it", afterReuse.status);

  console.log("\n# read-write connection (2026-era client)");
  const p2 = pkce();
  const rw = await approve(clientId, p2.challenge, ownerToken, [storeId], true);
  const rwCode = String(new URL(String(rw.redirectTo)).searchParams.get("code"));
  const rwTokens = await tokenRequest({ grant_type: "authorization_code", code: rwCode, client_id: clientId, redirect_uri: "http://localhost:43123/callback", code_verifier: p2.verifier, resource: MCP });
  check(rwTokens.body.scope === "catalog:read quotes:read catalog:write quotes:write", "read-write scopes granted", rwTokens.body.scope);
  const rwClient = await mcpClient(rwTokens.body.access_token, "auto");
  const rwTools = await rwClient.listTools();
  const annotation = (name: string) => rwTools.tools.find((t) => t.name === name)?.annotations ?? {};
  check(rwTools.tools.length === 12, "a read-write connection sees all 12 tools", rwTools.tools.map((t) => t.name));
  check(annotation("update_item").destructiveHint === true && annotation("set_visibility").openWorldHint === true && annotation("create_item").destructiveHint === false, "overwriting and publishing tools are marked destructive", [annotation("update_item"), annotation("set_visibility")]);
  const cat = await call(rwClient, "create_category", { store: storeId, name: "E2E Test Moulds", description: "Created by the e2e test" });
  check(!cat.isError && cat.data?.visible === false && cat.data?.id, "create_category creates a hidden category", cat);
  const sec = await call(rwClient, "add_section", { store: storeId, categoryId: cat.data.id, name: "Round" });
  const secAgain = await call(rwClient, "add_section", { store: storeId, categoryId: cat.data.id, name: "round" });
  check(sec.data?.section?.id && secAgain.data?.section?.id === sec.data.section.id, "add_section is idempotent by name", [sec, secAgain]);
  const item = await call(rwClient, "create_item", {
    store: storeId, categoryId: cat.data.id, sectionId: sec.data.section.id, name: "E2E Round Pillar", code: "E2E 1",
    specs: [{ label: "Approx. mould weight", value: "10 kg" }], variants: [{ name: "Material", options: ["Rubber", "PVC"] }], unit: "pcs",
  });
  check(!item.isError && item.data?.visible === false && item.data?.slug === "e2e-1-e2e-round-pillar", "create_item creates a hidden item with a slug", item);
  const badSection = await call(rwClient, "create_item", { store: storeId, categoryId: cat.data.id, sectionId: "nope", name: "X" });
  check(badSection.isError && badSection.text.includes("Section"), "create_item validates the section", badSection);
  const upd = await call(rwClient, "update_item", { store: storeId, itemId: item.data.id, categoryId: cat.data.id, description: "Updated by e2e", price: 1200 });
  check(upd.data?.updatedFields?.includes("description") && upd.data?.updatedFields?.includes("price") && !upd.data?.updatedFields?.includes("sectionId"), "update_item with the same category keeps the item in its section", upd);
  const parallel = await Promise.all([1, 2, 3].map(() => call(rwClient, "create_item", { store: storeId, categoryId: cat.data.id, name: "E2E Twin", code: "E2E 2" })));
  const twinSlugs = parallel.map((r) => r.data?.slug);
  check(new Set(twinSlugs).size === 3 && twinSlugs.every(Boolean), "parallel creates get unique slugs", twinSlugs);
  const detail = await call(rwClient, "get_item", { store: storeId, itemId: item.data.id });
  check(detail.data?.description === "Updated by e2e" && detail.data?.variants?.[0]?.options?.length === 2 && detail.data?.publicUrl === null, "get_item returns the full hidden item", detail.text.slice(0, 300));
  const hiddenPage = await fetch(`${BASE}/jr-demo/${cat.data.slug}/${item.data.slug}`);
  check(hiddenPage.status === 404, "hidden item is not public", hiddenPage.status);
  const pub = await call(rwClient, "set_visibility", { store: storeId, kind: "item", id: item.data.id, visible: true });
  check(pub.data?.visible === true && pub.data?.publicUrl === null && String(pub.data?.note).includes("hidden"), "publishing an item in a hidden category says it isn't live yet", pub);
  const pubCat = await call(rwClient, "set_visibility", { store: storeId, kind: "category", id: cat.data.id, visible: true });
  check(pubCat.data?.visibleItems === 1 && String(pubCat.data?.publicUrl).endsWith(`/jr-demo/${cat.data.slug}`), "publishing the category reports its visible items", pubCat);
  const publicPage = await fetch(`${BASE}/jr-demo/${cat.data.slug}/${item.data.slug}`);
  const html = await publicPage.text();
  check(publicPage.status === 200 && html.includes("E2E Round Pillar"), "published item appears on the public site right away", publicPage.status);
  // 2025-era clients get a streamed (SSE) reply: the edit must still refresh the public page.
  const legacy = await mcpClient(rwTokens.body.access_token, "legacy");
  await call(legacy, "update_item", { store: storeId, itemId: item.data.id, name: "E2E Round Pillar Renamed" });
  await legacy.close();
  const renamedPage = await (await fetch(`${BASE}/jr-demo/${cat.data.slug}/${item.data.slug}`)).text();
  check(renamedPage.includes("E2E Round Pillar Renamed"), "an edit over the streaming (2025) protocol shows on the public site right away");
  const q = await call(rwClient, "get_quote", { store: storeId, quote: quotes.data[0].quoteNumber });
  check(q.data?.quoteNumber === quotes.data[0].quoteNumber && Array.isArray(q.data?.items), "get_quote by quote number", q.text.slice(0, 200));
  const originalStatus = q.data.status;
  const st = await call(rwClient, "update_quote_status", { store: storeId, quote: q.data.quoteNumber, status: "closed" });
  check(st.data?.status === "closed", "update_quote_status", st);
  await call(rwClient, "update_quote_status", { store: storeId, quote: q.data.quoteNumber, status: originalStatus });
  await rwClient.close();

  console.log("\n# refresh rotation and revocation");
  const r1 = await tokenRequest({ grant_type: "refresh_token", refresh_token: rwTokens.body.refresh_token, client_id: clientId, resource: MCP });
  check(r1.status === 200 && r1.body.refresh_token !== rwTokens.body.refresh_token, "refresh rotates the refresh token", r1);
  const down = await tokenRequest({ grant_type: "refresh_token", refresh_token: r1.body.refresh_token, client_id: clientId, scope: "catalog:read" });
  check(down.body.scope === "catalog:read", "refresh can narrow scopes", down);
  const up = await tokenRequest({ grant_type: "refresh_token", refresh_token: down.body.refresh_token, client_id: clientId, scope: "catalog:read admin:all catalog:write quotes:write quotes:read" });
  check(up.status === 200, "refresh keeps the original grant's scopes available", up);
  const retry = await tokenRequest({ grant_type: "refresh_token", refresh_token: rwTokens.body.refresh_token, client_id: clientId });
  check(retry.status === 200, "a refresh retried within the grace window still works (parallel refreshes, lost responses)", retry);
  const race = await Promise.all([1, 2].map(() => tokenRequest({ grant_type: "refresh_token", refresh_token: retry.body.refresh_token, client_id: clientId })));
  const raceAccess = await fetch(MCP, { method: "POST", headers: { authorization: `Bearer ${race[0].body.access_token}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  check(race.every((r) => r.status === 200) && raceAccess.status === 200, "two simultaneous refreshes don't disconnect the owner", race.map((r) => r.status));
  // Pretend that first refresh happened two minutes ago: reuse now means the token leaked.
  const rtHash = createHash("sha256").update(rwTokens.body.refresh_token).digest("hex");
  await adminFs("PATCH", `oauthTokens/${rtHash}?updateMask.fieldPaths=usedAt`, { fields: { usedAt: { timestampValue: new Date(Date.now() - 120_000).toISOString() } } });
  const reuseRt = await tokenRequest({ grant_type: "refresh_token", refresh_token: rwTokens.body.refresh_token, client_id: clientId });
  check(reuseRt.body.error === "invalid_grant", "an old refresh token reused later is rejected", reuseRt);
  const afterRtReuse = await tokenRequest({ grant_type: "refresh_token", refresh_token: up.body.refresh_token, client_id: clientId });
  check(afterRtReuse.body.error === "invalid_grant", "that reuse disconnects the whole grant", afterRtReuse);

  const p3 = pkce();
  const third = await approve(clientId, p3.challenge, ownerToken, [storeId], false);
  const thirdCode = String(new URL(String(third.redirectTo)).searchParams.get("code"));
  const t3 = await tokenRequest({ grant_type: "authorization_code", code: thirdCode, client_id: clientId, redirect_uri: "http://localhost:43123/callback", code_verifier: p3.verifier });
  check(t3.status === 200, "code exchange without resource parameter (older clients)", t3);
  await fetch(`${BASE}/oauth/revoke`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: t3.body.refresh_token, client_id: clientId }).toString() });
  const afterRevoke = await fetch(MCP, { method: "POST", headers: { authorization: `Bearer ${t3.body.access_token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  check(afterRevoke.status === 401, "revoking the refresh token disconnects the app", afterRevoke.status);
  check((await rawStatus("/mcp", "evil.example")) === 403, "unexpected Host header is refused (local server only)");
  const pProbe = pkce();
  const probeApproval = await approve(clientId, pProbe.challenge, ownerToken, [storeId], false);
  const probe = await tokenRequest({ grant_type: "authorization_code", code: String(new URL(String(probeApproval.redirectTo)).searchParams.get("code")), client_id: clientId, redirect_uri: "http://localhost:43123/callback", code_verifier: pProbe.verifier });
  const probeToken = String(probe.body.access_token);
  const listHeaders = (token: string, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", ...extra });
  const evilOrigin = await fetch(MCP, { method: "POST", headers: listHeaders(probeToken, { origin: "https://evil.example" }), body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  const ownOrigin = await fetch(MCP, { method: "POST", headers: listHeaders(probeToken, { origin: BASE }), body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  check(evilOrigin.status === 403 && ownOrigin.status !== 403, "a foreign Origin is refused, our own origin and server-side clients are not", [evilOrigin.status, ownOrigin.status]);

  // 2026-07-28 subscriptions/listen is a long-lived stream: its acknowledgement must arrive promptly.
  const listenMeta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "e2e", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} };
  const abort = new AbortController();
  const listenStart = Date.now();
  let ackMs = -1;
  try {
    const listen = await fetch(MCP, {
      method: "POST",
      signal: abort.signal,
      headers: { ...listHeaders(probeToken), "mcp-protocol-version": "2026-07-28", "mcp-method": "subscriptions/listen" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "subscriptions/listen", params: { _meta: listenMeta, notifications: { toolsListChanged: true } } }),
    });
    const reader = listen.body!.getReader();
    const timer = setTimeout(() => abort.abort(), 4000);
    const { value } = await reader.read();
    clearTimeout(timer);
    if (new TextDecoder().decode(value).includes("acknowledged")) ackMs = Date.now() - listenStart;
    abort.abort();
  } catch {}
  check(ackMs >= 0 && ackMs < 3000, "2026 subscriptions/listen is acknowledged right away (not buffered)", ackMs);

  const pBatch = pkce();
  const batchApproval = await approve(clientId, pBatch.challenge, ownerToken, [storeId], false);
  const batchTok = await tokenRequest({ grant_type: "authorization_code", code: String(new URL(String(batchApproval.redirectTo)).searchParams.get("code")), client_id: clientId, redirect_uri: "http://localhost:43123/callback", code_verifier: pBatch.verifier });
  const batchBody = JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ jsonrpc: "2.0", id: i + 1, method: "tools/list" })));
  const batchStatuses: number[] = [];
  for (let i = 0; i < 4; i++) {
    const r = await fetch(MCP, { method: "POST", headers: listHeaders(batchTok.body.access_token, { "mcp-protocol-version": "2025-03-26" }), body: batchBody });
    batchStatuses.push(r.status);
    await r.text();
  }
  check(batchStatuses.slice(0, 3).every((s) => s === 200) && batchStatuses[3] === 429, "JSON-RPC batches count every message against the rate limit", batchStatuses);

  console.log("\n# reconnecting and account changes");
  const pa = pkce();
  const first = await approve(clientId, pa.challenge, ownerToken, [storeId], true);
  const firstTok = await tokenRequest({ grant_type: "authorization_code", code: String(new URL(String(first.redirectTo)).searchParams.get("code")), client_id: clientId, redirect_uri: "http://localhost:43123/callback", code_verifier: pa.verifier });
  const pb = pkce();
  const second = await approve(clientId, pb.challenge, ownerToken, [storeId], false);
  const secondTok = await tokenRequest({ grant_type: "authorization_code", code: String(new URL(String(second.redirectTo)).searchParams.get("code")), client_id: clientId, redirect_uri: "http://localhost:43123/callback", code_verifier: pb.verifier });
  const mcpStatus = async (token: string) =>
    (await fetch(MCP, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) })).status;
  check((await mcpStatus(firstTok.body.access_token)) === 401 && (await mcpStatus(secondTok.body.access_token)) === 200, "reconnecting the same self-registered app replaces its earlier connection");
  const claudeConnect = async () => {
    const pk = pkce();
    const params = { response_type: "code", client_id: "https://claude.ai/oauth/mcp-oauth-client-metadata", redirect_uri: "https://claude.ai/api/mcp/auth_callback", code_challenge: pk.challenge, code_challenge_method: "S256", state: "s", resource: MCP };
    const ok = await json(await fetch(`${BASE}/api/oauth/authorize`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${ownerToken}` }, body: JSON.stringify({ decision: "allow", params, storeIds: [storeId], allowChanges: false }) }));
    // The code goes straight to our token endpoint; nothing is sent to claude.ai.
    return tokenRequest({ grant_type: "authorization_code", code: String(new URL(String(ok.redirectTo)).searchParams.get("code")), client_id: params.client_id, redirect_uri: params.redirect_uri, code_verifier: pk.verifier, resource: MCP });
  };
  const claudeA = await claudeConnect();
  const claudeB = await claudeConnect();
  check((await mcpStatus(claudeA.body.access_token)) === 200 && (await mcpStatus(claudeB.body.access_token)) === 200, "two Claude connections (shared client id) coexist");

  const email = `e2e-${Date.now()}@example.com`;
  const signUp = await json(await fetch(`${AUTH}/accounts:signUp?key=demo-api-key`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "e2e-pass-123", returnSecureToken: true }) }));
  await adminFs("PATCH", "stores/e2e-disabled-store", { fields: { ownerId: { stringValue: signUp.localId }, name: { stringValue: "E2E Disabled" }, slug: { stringValue: "e2e-disabled" }, quotePrefix: { stringValue: "ED" }, quoteCounter: { integerValue: "1000" } } });
  const pc = pkce();
  const theirs = await approve(clientId, pc.challenge, String(signUp.idToken), ["e2e-disabled-store"], true);
  const theirTok = await tokenRequest({ grant_type: "authorization_code", code: String(new URL(String(theirs.redirectTo)).searchParams.get("code")), client_id: clientId, redirect_uri: "http://localhost:43123/callback", code_verifier: pc.verifier });
  await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-catalog-quote/accounts:update`, { method: "POST", headers: { authorization: "Bearer owner", "content-type": "application/json" }, body: JSON.stringify({ localId: signUp.localId, disableUser: true }) });
  check((await mcpStatus(theirTok.body.access_token)) === 401, "a disabled owner's connection stops working");
  const theirRefresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: theirTok.body.refresh_token, client_id: clientId });
  check(theirRefresh.body.error === "invalid_grant", "and can't be refreshed", theirRefresh);
  await adminFs("DELETE", "stores/e2e-disabled-store");
  const deny = await fetch(`${BASE}/api/oauth/authorize`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "deny", params: Object.fromEntries(authorizeQuery(clientId, p3.challenge)) }) });
  check(String((await json(deny)).redirectTo).includes("error=access_denied"), "cancel sends access_denied back to the app");

  console.log("\n# cleanup");
  const items = await adminFs("GET", `stores/${storeId}/items?pageSize=300`);
  for (const d of items.documents ?? []) if (String(d.fields?.code?.stringValue ?? "").startsWith("E2E")) await adminFs("DELETE", d.name.split("/documents/")[1]);
  await adminFs("DELETE", `stores/${storeId}/categories/${cat.data.id}`);
  await adminFs("DELETE", "stores/e2e-other-store");
  await adminFs("DELETE", "slugs/e2e-other");
  const grants = await adminFs("GET", "mcpGrants?pageSize=300");
  for (const g of grants.documents ?? []) {
    const clientIdField = g.fields?.clientId?.stringValue ?? "";
    if (g.fields?.clientName?.stringValue === "E2E Client" || clientIdField.startsWith("https://claude.ai/")) await adminFs("DELETE", g.name.split("/documents/")[1]);
  }
  console.log("  cleaned up test data");

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
