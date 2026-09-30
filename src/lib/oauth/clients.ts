import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebase-admin";
import { OAUTH_LIFETIMES } from "./config";
import net from "node:net";
import { fetchPublicHttps } from "./safe-fetch";
import { cleanDisplayName, isAcceptableRedirectUri, isLoopbackHost, randomToken, sha256Hex } from "./utils";

// OAuth clients: Client ID Metadata Documents (preferred by the current MCP spec,
// used by Claude and ChatGPT) and Dynamic Client Registration (deprecated, kept for
// older clients). All clients are public clients (token_endpoint_auth_method "none").

export type OAuthClient = {
  clientId: string;
  clientName: string;
  clientUri: string | null;
  redirectUris: string[];
  kind: "cimd" | "dcr";
  /** For CIMD: the host that published the metadata document (we fetched it from there). */
  verifiedHost: string | null;
  /** True only for CIMD documents on hosts we recognise (Claude, ChatGPT, VS Code...). */
  trusted: boolean;
};

/** CIMD hosts of well-known MCP clients. Only these get the "verified" treatment on the consent screen. */
const TRUSTED_CIMD_HOSTS = new Set(["claude.ai", "chatgpt.com", "vscode.dev", "cursor.com", "www.cursor.com"]);

export function isTrustedClientHost(host: string | null): boolean {
  return Boolean(host && TRUSTED_CIMD_HOSTS.has(host.toLowerCase()));
}

/** Dynamically registered clients expire after this long without use (longer than a refresh token lives). */
const DCR_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const dcrTouchedAt = new Map<string, number>();

export class ClientError extends Error {
  constructor(
    public readonly code: "invalid_client" | "invalid_request" | "invalid_client_metadata" | "invalid_redirect_uri",
    message: string,
  ) {
    super(message);
  }
}

const DCR_COLLECTION = "oauthClients";
const CIMD_CACHE = "oauthClientMetadataCache";

export function isCimdClientId(clientId: string): boolean {
  return clientId.startsWith("https://");
}

function validateCimdUrl(clientId: string): URL {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    throw new ClientError("invalid_client", "client_id is not a valid URL");
  }
  if (url.protocol !== "https:" || url.hash || url.username || url.password || url.pathname === "/" || !url.pathname) {
    throw new ClientError("invalid_client", "client_id metadata URL must be https with a path and no fragment");
  }
  if (isLoopbackHost(url.hostname) || net.isIP(url.hostname.replace(/^\[|\]$/g, "")) || (url.port && url.port !== "443")) {
    throw new ClientError("invalid_client", "client_id metadata URL must use a public host name on port 443");
  }
  return url;
}

function cacheSeconds(cacheControl: string | null): number {
  const maxAge = cacheControl?.match(/max-age=(\d+)/)?.[1];
  const seconds = maxAge ? Number(maxAge) : OAUTH_LIFETIMES.clientMetadataCacheMs / 1000;
  return Math.min(Math.max(seconds, 300), 24 * 60 * 60);
}

function parseClientMetadata(clientId: string, raw: unknown): OAuthClient {
  if (!raw || typeof raw !== "object") throw new ClientError("invalid_client", "Client metadata is not a JSON object");
  const doc = raw as Record<string, unknown>;
  if (doc.client_id !== clientId) throw new ClientError("invalid_client", "Client metadata client_id does not match its URL");
  const redirectUris = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!redirectUris.length || !redirectUris.every(isAcceptableRedirectUri)) {
    throw new ClientError("invalid_client", "Client metadata has no acceptable redirect_uris");
  }
  const host = new URL(clientId).host;
  const name = (typeof doc.client_name === "string" && cleanDisplayName(doc.client_name)) || host;
  const clientUri = typeof doc.client_uri === "string" && doc.client_uri.startsWith("https://") ? doc.client_uri : null;
  return { clientId, clientName: name, clientUri, redirectUris, kind: "cimd", verifiedHost: host, trusted: isTrustedClientHost(host) };
}

async function resolveCimdClient(clientId: string): Promise<OAuthClient> {
  validateCimdUrl(clientId);
  const db = adminDb();
  const cacheRef = db.doc(`${CIMD_CACHE}/${sha256Hex(clientId)}`);
  const cached = await cacheRef.get();
  if (cached.exists && (cached.get("expiresAt") as Timestamp).toMillis() > Date.now()) {
    return parseClientMetadata(clientId, JSON.parse(cached.get("document") as string));
  }
  // Failures are not cached (CIMD: "MUST NOT cache error responses"); abuse is limited by
  // the per-IP rate limit, the in-flight cap and the fetch deadline instead.
  let client: OAuthClient;
  let result;
  try {
    result = await fetchPublicHttps(clientId);
    if (result.status !== 200) throw new ClientError("invalid_client", `Client metadata returned HTTP ${result.status}`);
    let json: unknown;
    try {
      json = JSON.parse(result.body);
    } catch {
      throw new ClientError("invalid_client", "Client metadata is not valid JSON");
    }
    client = parseClientMetadata(clientId, json);
  } catch (err) {
    if (err instanceof ClientError) throw err;
    // Network details (DNS, ports, TLS) stay in our logs, never in the response.
    console.warn("[oauth] client metadata fetch failed:", (err as Error).message);
    throw new ClientError("invalid_client", "Could not load this app's details.");
  }
  await cacheRef
    .set({
      clientId,
      document: result.body,
      fetchedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + cacheSeconds(result.cacheControl) * 1000),
    })
    .catch((err) => console.warn("[oauth] could not cache client metadata:", (err as Error).message));
  return client;
}

async function resolveDcrClient(clientId: string): Promise<OAuthClient> {
  if (!/^dcr_[A-Za-z0-9_-]{20,80}$/.test(clientId)) throw new ClientError("invalid_client", "Unknown client_id");
  const snap = await adminDb().doc(`${DCR_COLLECTION}/${clientId}`).get();
  const expiresAt = snap.get("expiresAt") as Timestamp | undefined;
  if (!snap.exists || (expiresAt && expiresAt.toMillis() < Date.now())) throw new ClientError("invalid_client", "Unknown client_id");
  return {
    clientId,
    clientName: String(snap.get("clientName") ?? "Unnamed app"),
    clientUri: (snap.get("clientUri") as string | null) ?? null,
    redirectUris: (snap.get("redirectUris") as string[]) ?? [],
    kind: "dcr",
    verifiedHost: null,
    trusted: false,
  };
}

export async function resolveClient(clientId: string | null | undefined): Promise<OAuthClient> {
  if (!clientId || clientId.length > 500) throw new ClientError("invalid_client", "Missing or invalid client_id");
  return isCimdClientId(clientId) ? resolveCimdClient(clientId) : resolveDcrClient(clientId);
}

/** RFC 7591 registration. Returns the registered metadata (always a public client). */
export async function registerClient(body: unknown) {
  if (!body || typeof body !== "object") throw new ClientError("invalid_client_metadata", "Body must be a JSON object");
  const meta = body as Record<string, unknown>;
  const redirectUris = Array.isArray(meta.redirect_uris) ? meta.redirect_uris : [];
  if (!redirectUris.length || redirectUris.length > 10 || !redirectUris.every((u) => typeof u === "string" && isAcceptableRedirectUri(u))) {
    throw new ClientError("invalid_redirect_uri", "redirect_uris must be 1-10 https, loopback http or app-scheme URLs");
  }
  const grantTypes = Array.isArray(meta.grant_types) ? meta.grant_types : ["authorization_code", "refresh_token"];
  if (!grantTypes.every((g) => g === "authorization_code" || g === "refresh_token")) {
    throw new ClientError("invalid_client_metadata", "Only authorization_code and refresh_token grants are supported");
  }
  const clientName = (typeof meta.client_name === "string" && cleanDisplayName(meta.client_name)) || "Unnamed app";
  const clientUri = typeof meta.client_uri === "string" && meta.client_uri.startsWith("https://") ? meta.client_uri.slice(0, 300) : null;
  const clientId = randomToken("dcr_");
  const issuedAt = Math.floor(Date.now() / 1000);
  await adminDb().doc(`${DCR_COLLECTION}/${clientId}`).set({
    clientName,
    clientUri,
    redirectUris,
    createdAt: FieldValue.serverTimestamp(),
    // Unused registrations expire; every successful sign-in extends this (see store.ts).
    expiresAt: Timestamp.fromMillis(Date.now() + DCR_TTL_MS),
  });
  return {
    client_id: clientId,
    client_id_issued_at: issuedAt,
    client_name: clientName,
    ...(clientUri ? { client_uri: clientUri } : {}),
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}

/** Keeps a dynamically registered client alive while it is being used (at most once a day per instance). */
export async function touchDcrClient(clientId: string): Promise<void> {
  if (isCimdClientId(clientId)) return;
  const last = dcrTouchedAt.get(clientId);
  if (last && Date.now() - last < 24 * 60 * 60 * 1000) return;
  if (dcrTouchedAt.size > 5000) dcrTouchedAt.clear();
  dcrTouchedAt.set(clientId, Date.now());
  await adminDb()
    .doc(`${DCR_COLLECTION}/${clientId}`)
    .update({ expiresAt: Timestamp.fromMillis(Date.now() + DCR_TTL_MS) })
    .catch(() => {});
}
