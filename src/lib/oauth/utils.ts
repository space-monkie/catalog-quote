import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ALL_SCOPES, READ_SCOPES, WRITE_SCOPES, type Scope } from "./config";

// Pure OAuth helpers (no Firestore), unit tested in tests/unit/oauth.test.ts.

export function base64url(bytes: Buffer): string {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** High-entropy opaque token (256 bits) with a readable prefix, e.g. "cq_at_…". */
export function randomToken(prefix: string): string {
  return `${prefix}${base64url(randomBytes(32))}`;
}

/** Tokens and codes are stored only as SHA-256 hashes. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const PKCE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
const PKCE_CHALLENGE = /^[A-Za-z0-9\-_]{43}$/;

export function isValidCodeChallenge(challenge: string | null | undefined): challenge is string {
  return typeof challenge === "string" && PKCE_CHALLENGE.test(challenge);
}

/** RFC 7636 S256: BASE64URL(SHA256(ASCII(code_verifier))) == code_challenge. */
export function verifyPkceS256(verifier: string | null | undefined, challenge: string): boolean {
  if (typeof verifier !== "string" || !PKCE_VERIFIER.test(verifier)) return false;
  const expected = Buffer.from(base64url(createHash("sha256").update(verifier, "ascii").digest()));
  const given = Buffer.from(challenge);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Parses a space-separated scope string into known scopes. Unknown scopes (e.g.
 * offline_access, openid) are ignored. No scope parameter at all means every scope
 * (what our 401 challenge asks for); only unknown scopes means read-only.
 */
export function parseScopes(value: string | null | undefined): Scope[] {
  const requested = (value ?? "").split(/\s+/).filter(Boolean);
  if (!requested.length) return [...ALL_SCOPES];
  const known = ALL_SCOPES.filter((s) => requested.includes(s));
  return known.length ? known : [...READ_SCOPES];
}

/** Scopes the user actually grants: read scopes always, write scopes only when allowed. */
export function grantedScopes(requested: Scope[], allowChanges: boolean): Scope[] {
  return requested.filter((s) => allowChanges || !WRITE_SCOPES.includes(s));
}

/** Canonical form of a resource URI (RFC 8707): lowercase scheme/host, no fragment, no trailing slash. */
export function canonicalResource(value: string | null | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.hash || url.username || url.password) return null;
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.protocol}//${url.host}${path}${url.search}`;
}

export function resourceMatches(requested: string | null | undefined, expected: string): boolean {
  const a = canonicalResource(requested);
  return a !== null && a === canonicalResource(expected);
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

/**
 * Redirect URIs we accept: https, or http on a loopback host for native apps (RFC 8252).
 * The MCP spec requires "localhost or HTTPS", so private-use schemes are not accepted.
 * Never fragments or credentials.
 */
export function isAcceptableRedirectUri(value: string): boolean {
  if (typeof value !== "string" || value.length > 512) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return Boolean(url.hostname);
  if (url.protocol === "http:") return isLoopbackHost(url.hostname);
  return false;
}

/** Removes control and bidirectional-override characters from app-supplied display names. */
export function cleanDisplayName(value: string, max = 60): string {
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** http(s) redirect targets are the only ones we ever navigate to without a user click. */
export function isWebRedirect(uri: string): boolean {
  return uri.startsWith("https://") || uri.startsWith("http://");
}

/**
 * Exact string match against the registered redirect URIs, except that loopback
 * http redirects match on any port (RFC 8252 section 7.3; Claude Code relies on this
 * for both 127.0.0.1 and localhost).
 */
export function matchRedirectUri(registered: string[], requested: string | null | undefined): string | null {
  if (!requested || !isAcceptableRedirectUri(requested)) return null;
  if (registered.includes(requested)) return requested;
  const req = new URL(requested);
  if (req.protocol !== "http:" || !isLoopbackHost(req.hostname)) return null;
  for (const candidate of registered) {
    let reg: URL;
    try {
      reg = new URL(candidate);
    } catch {
      continue;
    }
    if (
      reg.protocol === "http:" &&
      reg.hostname.toLowerCase() === req.hostname.toLowerCase() &&
      reg.pathname === req.pathname &&
      reg.search === req.search
    ) {
      return requested;
    }
  }
  return null;
}

/** Appends OAuth response parameters to a redirect URI, keeping its existing query. */
export function withQuery(uri: string, params: Record<string, string | undefined>): string {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  }
  return url.toString();
}

/** Short label for the consent screen, e.g. "claude.ai" or "an app on this computer (localhost)". */
export function redirectLabel(uri: string): string {
  const url = new URL(uri);
  if (url.protocol === "https:" || url.protocol === "http:") return url.host;
  return `${url.protocol}//`;
}
