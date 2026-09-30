import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeParamsFrom, consentView, redirectWithError, validateAuthorization } from "@/lib/oauth/authorize";
import { OAUTH_ISSUER } from "@/lib/oauth/config";
import { createAuthorizationCode } from "@/lib/oauth/store";
import { grantedScopes, withQuery } from "@/lib/oauth/utils";
import { uidFromRequest } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { checkRateLimit, clientIp, ipRateKey } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

const noStore = { "cache-control": "no-store" };

function limited(request: Request): Response | null {
  if (checkRateLimit(`oauth-authorize:${ipRateKey(clientIp(request))}`, { limit: 60, windowMs: 10 * 60 * 1000 }).ok) return null;
  return NextResponse.json({ ok: false, kind: "show", error: "rate_limited", description: "Too many requests. Wait a few minutes." }, { status: 429, headers: noStore });
}

/** The consent screen calls this to validate the request and learn what to display. */
export async function GET(request: Request) {
  const rejected = limited(request);
  if (rejected) return rejected;
  const result = await validateAuthorization(authorizeParamsFrom(new URL(request.url).searchParams));
  if (!result.ok) return NextResponse.json(result, { headers: noStore });
  return NextResponse.json({ ok: true, view: consentView(result) }, { headers: noStore });
}

const decisionSchema = z.object({
  decision: z.enum(["allow", "deny"]),
  params: z.record(z.string(), z.unknown()),
  storeIds: z.array(z.string().min(1).max(64)).max(50).optional(),
  allowChanges: z.boolean().optional(),
});

/** The owner's decision. "allow" needs the owner's Firebase ID token. */
export async function POST(request: Request) {
  const rejected = limited(request);
  if (rejected) return rejected;
  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: noStore });
  const { decision, params, storeIds = [], allowChanges = false } = parsed.data;

  const result = await validateAuthorization(authorizeParamsFrom(params));
  if (!result.ok) return NextResponse.json(result, { headers: noStore });

  if (decision === "deny") {
    return NextResponse.json(
      { ok: true, redirectTo: redirectWithError(result.redirectUri, result.state, "access_denied", "The owner declined the request") },
      { headers: noStore },
    );
  }

  const uid = await uidFromRequest(request);
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  if (!checkRateLimit(`oauth-approve:${uid}`, { limit: 30, windowMs: 10 * 60 * 1000 }).ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: noStore });
  }

  const owned = await adminDb().collection("stores").where("ownerId", "==", uid).select().get();
  const ownedIds = new Set(owned.docs.map((d) => d.id));
  const chosen = Array.from(new Set(storeIds)).filter((id) => ownedIds.has(id));
  if (!chosen.length || chosen.length !== new Set(storeIds).size) {
    return NextResponse.json({ error: "invalid_stores" }, { status: 400, headers: noStore });
  }

  const scopes = grantedScopes(result.scopes, allowChanges);
  if (!scopes.length) {
    return NextResponse.json(
      { ok: true, redirectTo: redirectWithError(result.redirectUri, result.state, "access_denied", "No permissions were granted") },
      { headers: noStore },
    );
  }
  const code = await createAuthorizationCode({
    uid,
    client: result.client,
    redirectUri: result.redirectUri,
    codeChallenge: result.codeChallenge,
    scopes,
    storeIds: chosen,
    resource: result.resource,
  });
  const redirectTo = withQuery(result.redirectUri, { code, state: result.state ?? undefined, iss: OAUTH_ISSUER });
  return NextResponse.json({ ok: true, redirectTo }, { headers: noStore });
}
