import "server-only";
import { FieldValue, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/server/firebase-admin";
import { MCP_RESOURCE_URL, OAUTH_LIFETIMES, type Scope } from "./config";
import { touchDcrClient, type OAuthClient } from "./clients";
import { parseScopes, randomToken, resourceMatches, sha256Hex, verifyPkceS256 } from "./utils";

// Authorization codes, grants ("connected apps") and tokens, all server-only.
// Codes and tokens are stored as SHA-256 hashes; a leaked database dump can't be replayed.
//   oauthCodes/{sha256(code)}    single use, 10 minutes
//   mcpGrants/{grantId}          one per connection; the owner can list and delete these
//   oauthTokens/{sha256(token)}  access (1 h) and rotating refresh (60 days) tokens

const CODES = "oauthCodes";
const TOKENS = "oauthTokens";
export const GRANTS = "mcpGrants";

export class OAuthGrantError extends Error {
  constructor(
    public readonly code: "invalid_grant" | "invalid_request" | "invalid_scope" | "invalid_target",
    message: string,
  ) {
    super(message);
  }
}

export type GrantRecord = {
  id: string;
  uid: string;
  clientId: string;
  clientName: string;
  storeIds: string[];
  scopes: Scope[];
};

export type IssuedTokens = { accessToken: string; refreshToken: string; scopes: Scope[]; expiresIn: number };

function tokenRef(token: string): DocumentReference {
  return adminDb().doc(`${TOKENS}/${sha256Hex(token)}`);
}

function newTokenDocs(grant: Pick<GrantRecord, "id" | "uid" | "clientId">, scopes: Scope[], refreshScopes: Scope[]) {
  const now = Date.now();
  const accessToken = randomToken("cq_at_");
  const refreshToken = randomToken("cq_rt_");
  const base = { grantId: grant.id, uid: grant.uid, clientId: grant.clientId, resource: MCP_RESOURCE_URL, createdAt: FieldValue.serverTimestamp() };
  return {
    accessToken,
    refreshToken,
    access: { ...base, kind: "access", scopes, expiresAt: Timestamp.fromMillis(now + OAUTH_LIFETIMES.accessSeconds * 1000) },
    refresh: { ...base, kind: "refresh", scopes: refreshScopes, usedAt: null, expiresAt: Timestamp.fromMillis(now + OAUTH_LIFETIMES.refreshMs) },
  };
}

/** Called after the owner approves on the consent screen. Returns the one-time code. */
export async function createAuthorizationCode(input: {
  uid: string;
  client: OAuthClient;
  redirectUri: string;
  codeChallenge: string;
  scopes: Scope[];
  storeIds: string[];
  resource: string;
}): Promise<string> {
  const db = adminDb();
  const code = randomToken("cq_ac_");
  const grantId = db.collection(GRANTS).doc().id;
  await db.doc(`${CODES}/${sha256Hex(code)}`).set({
    grantId,
    uid: input.uid,
    clientId: input.client.clientId,
    clientName: input.client.clientName,
    clientKind: input.client.kind,
    clientHost: input.client.verifiedHost ?? new URL(input.redirectUri).host,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    scopes: input.scopes,
    storeIds: input.storeIds,
    resource: input.resource,
    used: false,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + OAUTH_LIFETIMES.codeMs),
  });
  return code;
}

async function revokeGrant(grantId: string | undefined, reason: string) {
  if (!grantId) return;
  console.warn(`[oauth] revoking connection ${grantId}: ${reason}`);
  await adminDb().doc(`${GRANTS}/${grantId}`).delete().catch(() => {});
}

// ---- owner account checks (disabled, deleted, or sessions revoked after e.g. a password reset) ----
const userChecks = new Map<string, { at: number; disabled: boolean; validAfter: number }>();
const USER_CHECK_TTL_MS = 60 * 1000;

function grantCreatedMs(grant: FirebaseFirestore.DocumentSnapshot): number {
  const ms = grant.get("createdAtMs");
  if (typeof ms === "number") return ms;
  return (grant.get("createdAt") as Timestamp | null)?.toMillis() ?? 0;
}

/** False when the owner's Firebase account no longer allows this grant to be used. */
async function ownerStillAllowed(uid: string, grantCreatedAt: number): Promise<boolean> {
  let entry = userChecks.get(uid);
  if (!entry || Date.now() - entry.at > USER_CHECK_TTL_MS) {
    try {
      const user = await adminAuth().getUser(uid);
      entry = {
        at: Date.now(),
        disabled: user.disabled,
        validAfter: user.tokensValidAfterTime ? Date.parse(user.tokensValidAfterTime) : 0,
      };
    } catch (err) {
      if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
      entry = { at: Date.now(), disabled: true, validAfter: 0 };
    }
    if (userChecks.size > 5000) userChecks.clear();
    userChecks.set(uid, entry);
  }
  return !entry.disabled && entry.validAfter <= grantCreatedAt;
}

/** authorization_code grant. Creates the grant (connected app) and the first token pair. */
export async function exchangeAuthorizationCode(input: {
  code: string | null;
  clientId: string | null;
  redirectUri: string | null;
  codeVerifier: string | null;
  resource: string | null;
}): Promise<IssuedTokens> {
  if (!input.code || !input.clientId || !input.redirectUri || !input.codeVerifier) {
    throw new OAuthGrantError("invalid_request", "code, client_id, redirect_uri and code_verifier are required");
  }
  const db = adminDb();
  const codeRef = db.doc(`${CODES}/${sha256Hex(input.code)}`);
  let reusedGrantId: string | undefined;
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(codeRef);
      if (!snap.exists) throw new OAuthGrantError("invalid_grant", "Unknown authorization code");
      const d = snap.data()!;
      if ((d.expiresAt as Timestamp).toMillis() < Date.now()) throw new OAuthGrantError("invalid_grant", "Authorization code expired");
      const legitimate =
        d.clientId === input.clientId && d.redirectUri === input.redirectUri && verifyPkceS256(input.codeVerifier, d.codeChallenge);
      if (d.used) {
        // Only the real client (right client, redirect and PKCE verifier) replaying a code
        // revokes what it issued; anyone else holding a spent code just gets an error.
        if (legitimate) reusedGrantId = d.grantId;
        throw new OAuthGrantError("invalid_grant", "Authorization code was already used");
      }
      if (d.clientId !== input.clientId) throw new OAuthGrantError("invalid_grant", "Code was issued to another client");
      if (d.redirectUri !== input.redirectUri) throw new OAuthGrantError("invalid_grant", "redirect_uri does not match the authorization request");
      if (!legitimate) throw new OAuthGrantError("invalid_grant", "PKCE verification failed");
      if (input.resource && !resourceMatches(input.resource, d.resource)) throw new OAuthGrantError("invalid_target", "resource does not match");

      const grant: GrantRecord = { id: d.grantId, uid: d.uid, clientId: d.clientId, clientName: d.clientName, storeIds: d.storeIds, scopes: d.scopes };
      const tokens = newTokenDocs(grant, grant.scopes, grant.scopes);
      // Reconnecting the same self-registered (DCR) app replaces its earlier connection. CIMD
      // client ids (Claude, ChatGPT) are shared by every user and device of that product, so
      // those connections stay side by side; the owner can remove old ones in Settings.
      if (d.clientKind === "dcr") {
        const earlier = await tx.get(db.collection(GRANTS).where("uid", "==", grant.uid).where("clientId", "==", grant.clientId));
        earlier.docs.filter((g) => g.id !== grant.id).forEach((g) => tx.delete(g.ref));
      }
      tx.update(codeRef, { used: true, usedAt: FieldValue.serverTimestamp() });
      tx.set(db.doc(`${GRANTS}/${grant.id}`), {
        uid: grant.uid,
        clientId: grant.clientId,
        clientName: grant.clientName,
        clientKind: d.clientKind,
        clientHost: d.clientHost,
        storeIds: grant.storeIds,
        scopes: grant.scopes,
        createdAt: FieldValue.serverTimestamp(),
        createdAtMs: Date.now(),
        lastUsedAt: null,
        // Unused connections disappear once their last refresh token could have expired.
        expiresAt: Timestamp.fromMillis(Date.now() + OAUTH_LIFETIMES.refreshMs),
      });
      tx.set(tokenRef(tokens.accessToken), tokens.access);
      tx.set(tokenRef(tokens.refreshToken), tokens.refresh);
      return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, scopes: grant.scopes, expiresIn: OAUTH_LIFETIMES.accessSeconds };
    }).then(async (issued) => {
      console.info(`[oauth] new connection for client ${input.clientId}`);
      await touchDcrClient(input.clientId!);
      return issued;
    });
  } finally {
    // A replayed code means it may have leaked: revoke everything issued from it (OAuth 2.1 4.1.2).
    if (reusedGrantId) await revokeGrant(reusedGrantId, "authorization code replayed");
  }
}

/**
 * A refresh token presented again within this window (parallel refreshes, or a retry after
 * a lost response) gets a fresh pair instead of revoking the connection.
 */
const REFRESH_REUSE_GRACE_MS = 60 * 1000;

/** refresh_token grant with rotation. A reused refresh token revokes the whole grant. */
export async function refreshTokens(input: {
  refreshToken: string | null;
  clientId: string | null;
  scope: string | null;
  resource: string | null;
}): Promise<IssuedTokens> {
  if (!input.refreshToken || !input.clientId) throw new OAuthGrantError("invalid_request", "refresh_token and client_id are required");
  const db = adminDb();
  const ref = tokenRef(input.refreshToken);
  let reusedGrantId: string | undefined;
  let revokeReason = "old refresh token reused";
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.get("kind") !== "refresh") throw new OAuthGrantError("invalid_grant", "Unknown refresh token");
      const d = snap.data()!;
      if (d.clientId !== input.clientId) throw new OAuthGrantError("invalid_grant", "Refresh token was issued to another client");
      if ((d.expiresAt as Timestamp).toMillis() < Date.now()) throw new OAuthGrantError("invalid_grant", "Refresh token expired");
      const usedAt = d.usedAt as Timestamp | null;
      if (usedAt && Date.now() - usedAt.toMillis() > REFRESH_REUSE_GRACE_MS) {
        reusedGrantId = d.grantId;
        throw new OAuthGrantError("invalid_grant", "Refresh token was already used");
      }
      if (input.resource && !resourceMatches(input.resource, d.resource)) throw new OAuthGrantError("invalid_target", "resource does not match");
      const grantSnap = await tx.get(db.doc(`${GRANTS}/${d.grantId}`));
      if (!grantSnap.exists) throw new OAuthGrantError("invalid_grant", "This connection was removed");
      if (!(await ownerStillAllowed(d.uid, grantCreatedMs(grantSnap)))) {
        reusedGrantId = d.grantId;
        revokeReason = "owner account disabled, deleted or signed out everywhere";
        throw new OAuthGrantError("invalid_grant", "The owner's account no longer allows this connection");
      }

      const original = d.scopes as Scope[];
      let scopes = original;
      if (input.scope) {
        const requested = parseScopes(input.scope);
        if (!requested.every((s) => original.includes(s))) throw new OAuthGrantError("invalid_scope", "Requested scope exceeds the original grant");
        scopes = requested;
      }
      const tokens = newTokenDocs({ id: d.grantId, uid: d.uid, clientId: d.clientId }, scopes, original);
      if (!usedAt) {
        // Keep the used token only long enough to detect replays, not for its full 60 days.
        const shortened = Math.min((d.expiresAt as Timestamp).toMillis(), Date.now() + 7 * 24 * 60 * 60 * 1000);
        tx.update(ref, { usedAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(shortened) });
      }
      tx.update(grantSnap.ref, { expiresAt: Timestamp.fromMillis(Date.now() + OAUTH_LIFETIMES.refreshMs) });
      tx.set(tokenRef(tokens.accessToken), tokens.access);
      tx.set(tokenRef(tokens.refreshToken), tokens.refresh);
      return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, scopes, expiresIn: OAUTH_LIFETIMES.accessSeconds };
    }).then(async (issued) => {
      await touchDcrClient(input.clientId!);
      return issued;
    });
  } finally {
    if (reusedGrantId) await revokeGrant(reusedGrantId, revokeReason);
  }
}

export type VerifiedAccess = GrantRecord & { expiresAt: number };

const LAST_USED_WRITE_INTERVAL_MS = 60 * 60 * 1000;

/** Validates an access token for the MCP endpoint. Returns null when it must be rejected. */
export async function verifyAccessToken(token: string): Promise<VerifiedAccess | null> {
  if (!token.startsWith("cq_at_") || token.length > 200) return null;
  const db = adminDb();
  const snap = await tokenRef(token).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  if (d.kind !== "access") return null;
  const expiresAt = (d.expiresAt as Timestamp).toMillis();
  if (expiresAt < Date.now()) return null;
  if (!resourceMatches(d.resource, MCP_RESOURCE_URL)) return null;
  const grantRef = db.doc(`${GRANTS}/${d.grantId}`);
  const grant = await grantRef.get();
  if (!grant.exists || grant.get("uid") !== d.uid) return null;
  if (!(await ownerStillAllowed(d.uid, grantCreatedMs(grant)))) {
    await revokeGrant(grant.id, "owner account disabled, deleted or signed out everywhere");
    return null;
  }
  const lastUsed = grant.get("lastUsedAt") as Timestamp | null;
  if (!lastUsed || Date.now() - lastUsed.toMillis() > LAST_USED_WRITE_INTERVAL_MS) {
    void grantRef.update({ lastUsedAt: FieldValue.serverTimestamp() }).catch(() => {});
  }
  return {
    id: grant.id,
    uid: d.uid,
    clientId: d.clientId,
    clientName: String(grant.get("clientName") ?? ""),
    storeIds: (grant.get("storeIds") as string[]) ?? [],
    scopes: (d.scopes as Scope[]) ?? [],
    expiresAt: Math.floor(expiresAt / 1000),
  };
}

/** RFC 7009. Revoking a refresh token disconnects the whole grant. Unknown tokens are ignored. */
export async function revokeToken(token: string | null, clientId: string | null): Promise<void> {
  if (!token) return;
  const ref = tokenRef(token);
  const snap = await ref.get();
  if (!snap.exists) return;
  if (clientId && snap.get("clientId") !== clientId) return;
  if (snap.get("kind") === "refresh") await revokeGrant(snap.get("grantId"), "refresh token revoked by the client");
  await ref.delete();
}
