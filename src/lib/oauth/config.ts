// Connector (MCP) and OAuth settings. Safe to import on the client and the server:
// everything here derives from the public site URL.

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

/** Our authorization server's issuer identifier (RFC 8414). No trailing slash. */
export const OAUTH_ISSUER = siteUrl;

/** The URL owners paste into Claude/ChatGPT. Also the RFC 8707 resource (token audience). */
export const MCP_PATH = "/mcp";
export const MCP_RESOURCE_URL = `${siteUrl}${MCP_PATH}`;

/** RFC 9728 path-aware protected resource metadata URL for MCP_RESOURCE_URL. */
export const PROTECTED_RESOURCE_METADATA_URL = `${siteUrl}/.well-known/oauth-protected-resource${MCP_PATH}`;

export const OAUTH_ENDPOINTS = {
  authorization: `${siteUrl}/oauth/authorize`,
  token: `${siteUrl}/oauth/token`,
  registration: `${siteUrl}/oauth/register`,
  revocation: `${siteUrl}/oauth/revoke`,
};

export const SCOPES = {
  catalogRead: "catalog:read",
  catalogWrite: "catalog:write",
  quotesRead: "quotes:read",
  quotesWrite: "quotes:write",
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];
export const READ_SCOPES: Scope[] = [SCOPES.catalogRead, SCOPES.quotesRead];
export const WRITE_SCOPES: Scope[] = [SCOPES.catalogWrite, SCOPES.quotesWrite];
export const ALL_SCOPES: Scope[] = [...READ_SCOPES, ...WRITE_SCOPES];

export const OAUTH_LIFETIMES = {
  codeMs: 10 * 60 * 1000,
  accessSeconds: 60 * 60,
  refreshMs: 60 * 24 * 60 * 60 * 1000,
  clientMetadataCacheMs: 60 * 60 * 1000,
};
