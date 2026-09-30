import "server-only";
import { ClientError, resolveClient, type OAuthClient } from "./clients";
import { MCP_RESOURCE_URL, OAUTH_ISSUER, type Scope } from "./config";
import { isLoopbackHost, isValidCodeChallenge, isWebRedirect, matchRedirectUri, parseScopes, redirectLabel, resourceMatches, withQuery } from "./utils";

// Validation of an authorization request, shared by the consent screen's GET (to show it)
// and POST (to act on the owner's decision). Errors about the client or redirect URI are
// shown on our page; everything else is sent back to the client's redirect URI (RFC 6749 4.1.2.1).

export type AuthorizeParams = {
  responseType: string | null;
  clientId: string | null;
  redirectUri: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  state: string | null;
  scope: string | null;
  resource: string | null;
};

export function authorizeParamsFrom(source: URLSearchParams | Record<string, unknown>): AuthorizeParams {
  const get = (key: string): string | null => {
    const value = source instanceof URLSearchParams ? source.get(key) : source[key];
    return typeof value === "string" ? value : null;
  };
  return {
    responseType: get("response_type"),
    clientId: get("client_id"),
    redirectUri: get("redirect_uri"),
    codeChallenge: get("code_challenge"),
    codeChallengeMethod: get("code_challenge_method"),
    state: get("state"),
    scope: get("scope"),
    resource: get("resource"),
  };
}

export type ValidAuthorization = {
  ok: true;
  client: OAuthClient;
  redirectUri: string;
  scopes: Scope[];
  resource: string;
  state: string | null;
  codeChallenge: string;
};

export type AuthorizationProblem =
  | { ok: false; kind: "show"; error: string; description: string }
  | { ok: false; kind: "redirect"; error: string; redirectTo: string; redirectHost: string; description: string };

export function redirectWithError(redirectUri: string, state: string | null, error: string, description: string): string {
  return withQuery(redirectUri, { error, error_description: description, state: state ?? undefined, iss: OAUTH_ISSUER });
}

export async function validateAuthorization(p: AuthorizeParams): Promise<ValidAuthorization | AuthorizationProblem> {
  let client: OAuthClient;
  try {
    client = await resolveClient(p.clientId);
  } catch (err) {
    if (err instanceof ClientError) return { ok: false, kind: "show", error: "invalid_client", description: err.message };
    console.error("[oauth] could not resolve client:", (err as Error)?.message);
    return { ok: false, kind: "show", error: "server_error", description: "Could not load the app's details" };
  }
  const redirectUri = matchRedirectUri(client.redirectUris, p.redirectUri);
  if (!redirectUri) {
    return { ok: false, kind: "show", error: "invalid_request", description: "redirect_uri is missing or not registered for this app" };
  }
  // The consent page never follows these automatically: the owner clicks "Return to <host>"
  // (the client may be self-registered, so its redirect URI isn't trusted).
  const fail = (error: string, description: string): AuthorizationProblem => ({
    ok: false,
    kind: "redirect",
    error,
    redirectTo: redirectWithError(redirectUri, p.state, error, description),
    redirectHost: redirectLabel(redirectUri),
    description,
  });
  if (p.state && p.state.length > 1000) return fail("invalid_request", "state is too long");
  if (p.responseType !== "code") return fail("unsupported_response_type", "Only response_type=code is supported");
  if (p.codeChallengeMethod !== "S256" || !isValidCodeChallenge(p.codeChallenge)) {
    return fail("invalid_request", "PKCE with code_challenge_method=S256 is required");
  }
  if (p.resource && !resourceMatches(p.resource, MCP_RESOURCE_URL)) {
    return fail("invalid_target", `This server only issues tokens for ${MCP_RESOURCE_URL}`);
  }
  return {
    ok: true,
    client,
    redirectUri,
    scopes: parseScopes(p.scope),
    resource: MCP_RESOURCE_URL,
    state: p.state,
    codeChallenge: p.codeChallenge,
  };
}

/** What the consent screen needs to show (no secrets). */
export function consentView(v: ValidAuthorization) {
  const redirect = new URL(v.redirectUri);
  return {
    clientName: v.client.clientName,
    clientKind: v.client.kind,
    trusted: v.client.trusted,
    webRedirect: isWebRedirect(v.redirectUri),
    verifiedHost: v.client.verifiedHost,
    redirectHost: redirectLabel(v.redirectUri),
    loopbackOnly: v.client.redirectUris.every((u) => {
      try {
        const url = new URL(u);
        return url.protocol === "http:" && isLoopbackHost(url.hostname);
      } catch {
        return false;
      }
    }) || (redirect.protocol === "http:" && isLoopbackHost(redirect.hostname)),
    scopes: v.scopes,
  };
}
