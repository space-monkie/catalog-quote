import {
  bearerAuthChallengeResponse,
  createMcpHandler,
  hostHeaderValidationResponse,
  OAuthError,
  originValidationResponse,
  verifyBearerToken,
} from "@modelcontextprotocol/server";
import { accessTokenVerifier } from "@/lib/mcp/auth";
import { buildMcpServer } from "@/lib/mcp/server";
import { ALL_SCOPES, OAUTH_ISSUER, PROTECTED_RESOURCE_METADATA_URL } from "@/lib/oauth/config";
import { PUBLIC_CORS_HEADERS, preflight, withHeaders } from "@/lib/oauth/http";
import { isLoopbackHost } from "@/lib/oauth/utils";
import { checkRateLimit } from "@/lib/server/rate-limit";

// The connector endpoint owners paste into Claude / ChatGPT: <site>/mcp (Streamable HTTP, stateless).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler(buildMcpServer, {
  legacy: "stateless",
  responseMode: "auto",
  onerror: (err) => console.error("[mcp]", err.message),
});

const issuerHost = new URL(OAUTH_ISSUER).hostname;
const localHosts = ["localhost", "127.0.0.1", "[::1]"];
const extraHosts = (process.env.MCP_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean);
// DNS-rebinding protection for a server on localhost. In production (App Hosting / Cloud Run)
// the container sees an internal *.run.app Host header, so the check only runs locally.
const enforceHost = isLoopbackHost(issuerHost);
const allowedOrigins = [issuerHost, ...localHosts, ...extraHosts];

/** 2025-era protocol requests (no version header yet, or a 2025-* version). */
function isLegacyRequest(request: Request): boolean {
  const version = request.headers.get("mcp-protocol-version");
  return !version || version.startsWith("2025-");
}

/** A JSON-RPC batch counts as one request per message against the rate limit. */
async function requestCost(request: Request): Promise<number> {
  if (request.method !== "POST") return 1;
  try {
    const body = await request.clone().json();
    return Array.isArray(body) ? Math.max(1, body.length) : 1;
  } catch {
    return 1;
  }
}

async function handle(request: Request): Promise<Response> {
  if (enforceHost) {
    const badHost = hostHeaderValidationResponse(request, [...localHosts, ...extraHosts]);
    if (badHost) {
      console.warn("[mcp] rejected Host header:", request.headers.get("host"));
      return withHeaders(badHost, PUBLIC_CORS_HEADERS);
    }
  }
  // Spec (Streamable HTTP): a present, unexpected Origin gets 403. Server-side clients
  // (Claude, ChatGPT, Claude Code) send no Origin and pass.
  const badOrigin = originValidationResponse(request, allowedOrigins);
  if (badOrigin) return withHeaders(badOrigin, PUBLIC_CORS_HEADERS);

  let authInfo;
  try {
    authInfo = await verifyBearerToken(request.headers.get("authorization"), {
      verifier: accessTokenVerifier,
      resourceMetadataUrl: PROTECTED_RESOURCE_METADATA_URL,
    });
  } catch (err) {
    if (!(err instanceof OAuthError)) console.error("[mcp] token verification failed:", (err as Error)?.message);
    // 401 names every scope so clients ask for everything in one consent screen.
    return withHeaders(
      bearerAuthChallengeResponse(err, { requiredScopes: ALL_SCOPES, resourceMetadataUrl: PROTECTED_RESOURCE_METADATA_URL }),
      PUBLIC_CORS_HEADERS,
    );
  }

  const grantId = String(authInfo.extra?.grantId ?? authInfo.clientId);
  if (!checkRateLimit(`mcp:${grantId}`, { limit: 300, windowMs: 5 * 60 * 1000 }, Date.now(), await requestCost(request)).ok) {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Too many requests. Wait a few minutes." } },
      { status: 429, headers: PUBLIC_CORS_HEADERS },
    );
  }

  const response = await handler.fetch(request, { authInfo });
  // 2025-era clients (Claude today) get a text/event-stream reply whose tool work finishes
  // after this function returns; Next.js only applies cache revalidations queued while the
  // handler is running. Our tools are short, so finish the stream here before returning.
  if (
    request.method === "POST" &&
    isLegacyRequest(request) &&
    response.body &&
    response.headers.get("content-type")?.startsWith("text/event-stream")
  ) {
    const text = await response.text();
    return withHeaders(new Response(text, { status: response.status, headers: response.headers }), PUBLIC_CORS_HEADERS);
  }
  return withHeaders(response, PUBLIC_CORS_HEADERS);
}

export { handle as GET, handle as POST, handle as DELETE };
export const OPTIONS = preflight;
