import { exchangeAuthorizationCode, OAuthGrantError, refreshTokens, type IssuedTokens } from "@/lib/oauth/store";
import { jsonResponse, oauthError, preflight, readParams } from "@/lib/oauth/http";
import { checkRateLimit, clientIp, ipRateKey } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

function tokenResponse(t: IssuedTokens) {
  return jsonResponse({
    access_token: t.accessToken,
    token_type: "Bearer",
    expires_in: t.expiresIn,
    refresh_token: t.refreshToken,
    scope: t.scopes.join(" "),
  });
}

export async function POST(request: Request) {
  // Backstop only: AI clients refresh from shared egress ranges, so keep it generous.
  const limit = checkRateLimit(`oauth-token:${ipRateKey(clientIp(request))}`, { limit: 300, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) {
    const res = oauthError("invalid_request", "Too many token requests. Retry later.", 429);
    res.headers.set("retry-after", String(Math.ceil(limit.retryAfterMs / 1000)));
    return res;
  }
  const params = await readParams(request);
  const grantType = params.get("grant_type");
  try {
    if (grantType === "authorization_code") {
      return tokenResponse(
        await exchangeAuthorizationCode({
          code: params.get("code"),
          clientId: params.get("client_id"),
          redirectUri: params.get("redirect_uri"),
          codeVerifier: params.get("code_verifier"),
          resource: params.get("resource"),
        }),
      );
    }
    if (grantType === "refresh_token") {
      return tokenResponse(
        await refreshTokens({
          refreshToken: params.get("refresh_token"),
          clientId: params.get("client_id"),
          scope: params.get("scope"),
          resource: params.get("resource"),
        }),
      );
    }
    return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token");
  } catch (err) {
    if (err instanceof OAuthGrantError) return oauthError(err.code, err.message);
    console.error("[oauth/token]", (err as Error).message);
    return oauthError("server_error", "Unexpected error", 500);
  }
}

export const OPTIONS = preflight;
