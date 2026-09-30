import "server-only";
import { OAuthError, OAuthErrorCode, type AuthInfo, type OAuthTokenVerifier } from "@modelcontextprotocol/server";
import { MCP_RESOURCE_URL } from "@/lib/oauth/config";
import { verifyAccessToken } from "@/lib/oauth/store";

/** Validates our own opaque access tokens (audience-bound to MCP_RESOURCE_URL). */
export const accessTokenVerifier: OAuthTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const access = await verifyAccessToken(token);
    if (!access) throw new OAuthError(OAuthErrorCode.InvalidToken, "The access token is invalid, expired or revoked");
    return {
      token,
      clientId: access.clientId,
      scopes: access.scopes,
      expiresAt: access.expiresAt,
      resource: new URL(MCP_RESOURCE_URL),
      extra: { uid: access.uid, storeIds: access.storeIds, grantId: access.id },
    };
  },
};
