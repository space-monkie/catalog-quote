import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { uidFromRequest } from "@/lib/server/auth";
import { getStoreByIdFresh, slugTag, storeTag } from "@/lib/server/catalog";

export const runtime = "nodejs";

const bodySchema = z.object({
  storeId: z.string().min(1).max(64),
  previousSlug: z.string().max(60).optional(),
});

/**
 * POST /api/revalidate — called by the dashboard after an owner saves.
 * Verifies the Firebase ID token and store ownership, then purges the store's cached pages.
 */
export async function POST(request: Request) {
  const uid = await uidFromRequest(request);
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { storeId, previousSlug } = parsed.data;

  const store = await getStoreByIdFresh(storeId);
  // A deleted store still needs its old slug purged; only its (former) owner can do that.
  if (store && store.ownerId !== uid) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const tags = [storeTag(storeId)];
  if (store) tags.push(slugTag(store.slug));
  if (previousSlug) tags.push(slugTag(previousSlug));
  // { expire: 0 }: the next request re-renders instead of serving stale content.
  tags.forEach((tag) => revalidateTag(tag, { expire: 0 }));

  return NextResponse.json({ ok: true, tags });
}
