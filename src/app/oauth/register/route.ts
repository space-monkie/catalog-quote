import { ClientError, registerClient } from "@/lib/oauth/clients";
import { jsonResponse, oauthError, preflight } from "@/lib/oauth/http";
import { checkRateLimit, clientIp, ipRateKey } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

// RFC 7591 Dynamic Client Registration. Deprecated by the MCP spec in favour of Client ID
// Metadata Documents, but kept for clients that don't support those yet.
export async function POST(request: Request) {
  const hour = 60 * 60 * 1000;
  if (
    !checkRateLimit(`oauth-register:${ipRateKey(clientIp(request))}`, { limit: 60, windowMs: hour }).ok ||
    !checkRateLimit("oauth-register:all", { limit: 500, windowMs: hour }).ok
  ) {
    return oauthError("invalid_request", "Too many registrations. Try again later.", 429);
  }
  const text = await request.text();
  if (text.length > 8 * 1024) return oauthError("invalid_client_metadata", "Registration request is too large");
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return oauthError("invalid_client_metadata", "Body must be JSON");
  }
  try {
    return jsonResponse(await registerClient(body), 201);
  } catch (err) {
    if (err instanceof ClientError) return oauthError(err.code, err.message);
    console.error("[oauth/register]", (err as Error).message);
    return oauthError("server_error", "Unexpected error", 500);
  }
}

export const OPTIONS = preflight;
