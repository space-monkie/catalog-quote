import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { adminDb } from "./firebase-admin";
import { categoryFromData, itemFromData, storeFromData } from "@/lib/firebase/converters";
import type { Category, Item, PublicStore, Store } from "@/lib/schemas/types";

// Cached reads for public pages. Every store's data is tagged so an owner's save
// purges it (see /api/revalidate); pages also revalidate on a timer as a safety net.

export const PUBLIC_REVALIDATE_SECONDS = 60;

export const storeTag = (storeId: string) => `store:${storeId}`;
export const slugTag = (slug: string) => `slug:${slug}`;

async function fetchStoreBySlug(slug: string): Promise<Store | null> {
  const db = adminDb();
  const slugSnap = await db.doc(`slugs/${slug}`).get();
  const storeId = slugSnap.exists ? (slugSnap.get("storeId") as string | undefined) : undefined;
  if (!storeId) return null;
  const storeSnap = await db.doc(`stores/${storeId}`).get();
  if (!storeSnap.exists) return null;
  const store = storeFromData(storeSnap.id, storeSnap.data() ?? {});
  return store.slug === slug ? store : null;
}

async function fetchCategories(storeId: string): Promise<Category[]> {
  const db = adminDb();
  const snap = await db.collection(`stores/${storeId}/categories`).orderBy("order").get();
  return snap.docs
    .map((d) => categoryFromData(d.id, d.data()))
    .filter((c) => c.visible)
    .map((c) => ({ ...c, sections: c.sections.filter((s) => s.visible) }));
}

async function fetchItemsForCategory(storeId: string, categoryId: string): Promise<Item[]> {
  const db = adminDb();
  const snap = await db.collection(`stores/${storeId}/items`).where("categoryId", "==", categoryId).get();
  return snap.docs
    .map((d) => itemFromData(d.id, d.data()))
    .filter((i) => i.visible)
    .sort((a, b) => a.order - b.order);
}

/** Full store record (server only; never send ownerId/whatsappNumber to the browser wholesale). */
export const getStoreBySlug = cache((slug: string) =>
  unstable_cache(() => fetchStoreBySlug(slug), ["store-by-slug", slug], {
    tags: [slugTag(slug)],
    revalidate: PUBLIC_REVALIDATE_SECONDS,
  })(),
);

export const getVisibleCategories = cache((storeId: string) =>
  unstable_cache(() => fetchCategories(storeId), ["categories", storeId], {
    tags: [storeTag(storeId)],
    revalidate: PUBLIC_REVALIDATE_SECONDS,
  })(),
);

export const getVisibleItemsForCategory = cache((storeId: string, categoryId: string) =>
  unstable_cache(() => fetchItemsForCategory(storeId, categoryId), ["items", storeId, categoryId], {
    tags: [storeTag(storeId)],
    revalidate: PUBLIC_REVALIDATE_SECONDS,
  })(),
);

export async function getVisibleCategoryBySlug(storeId: string, slug: string): Promise<Category | null> {
  const categories = await getVisibleCategories(storeId);
  return categories.find((c) => c.slug === slug) ?? null;
}

export async function getVisibleItemBySlug(storeId: string, categoryId: string, slug: string): Promise<Item | null> {
  const items = await getVisibleItemsForCategory(storeId, categoryId);
  return items.find((i) => i.slug === slug) ?? null;
}

export function toPublicStore(store: Store): PublicStore {
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    logo: store.logo,
    about: store.about,
    brandColor: store.brandColor,
    showPrices: store.showPrices,
    currency: store.currency,
  };
}

// ---- uncached reads (quote creation must see the latest catalog) ----

export async function getStoreBySlugFresh(slug: string): Promise<Store | null> {
  return fetchStoreBySlug(slug);
}

export async function getStoreByIdFresh(storeId: string): Promise<Store | null> {
  const snap = await adminDb().doc(`stores/${storeId}`).get();
  return snap.exists ? storeFromData(snap.id, snap.data() ?? {}) : null;
}

export async function getItemsByIdsFresh(storeId: string, ids: string[]): Promise<Map<string, Item>> {
  const db = adminDb();
  const unique = Array.from(new Set(ids));
  const out = new Map<string, Item>();
  if (!unique.length) return out;
  const refs = unique.map((id) => db.doc(`stores/${storeId}/items/${id}`));
  const snaps = await db.getAll(...refs);
  snaps.forEach((s) => {
    if (s.exists) out.set(s.id, itemFromData(s.id, s.data() ?? {}));
  });
  return out;
}

export async function getCategoriesByIdsFresh(storeId: string, ids: string[]): Promise<Map<string, Category>> {
  const db = adminDb();
  const unique = Array.from(new Set(ids));
  const out = new Map<string, Category>();
  if (!unique.length) return out;
  const snaps = await db.getAll(...unique.map((id) => db.doc(`stores/${storeId}/categories/${id}`)));
  snaps.forEach((s) => {
    if (s.exists) out.set(s.id, categoryFromData(s.id, s.data() ?? {}));
  });
  return out;
}
