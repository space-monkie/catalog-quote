import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { revalidateTag } from "next/cache";
import { adminDb } from "@/lib/server/firebase-admin";
import { slugTag, storeTag } from "@/lib/server/catalog";
import { categoryFromData, itemFromData, quoteFromData, storeFromData } from "@/lib/firebase/converters";
import { absoluteUrl } from "@/lib/format";
import { randomId } from "@/lib/ids";
import { isReservedCategorySlug, SLUG_PATTERN, slugify, slugQueryStem, uniqueSlug } from "@/lib/slug";
import { OAUTH_ISSUER } from "@/lib/oauth/config";
import type { Category, Item, QuoteStatus, Spec, Store, VariantGroup } from "@/lib/schemas/types";

// Catalog and quote operations for the MCP tools. Runs with the Admin SDK, so every
// function enforces access itself: the store must be in the connection's grant AND
// still owned by the user. Documents keep exactly the shape firestore.rules enforces,
// so the owner can keep editing them in the dashboard.

export class ToolError extends Error {}

const MAX_CATEGORIES = 200;
const MAX_ITEMS = 2000;
const CATALOG_OVERVIEW_ITEM_LIMIT = 300;

export type Access = { uid: string; storeIds: string[] };

const db = () => adminDb();

function revalidateStore(store: Store) {
  try {
    revalidateTag(storeTag(store.id), { expire: 0 });
    revalidateTag(slugTag(store.slug), { expire: 0 });
  } catch (err) {
    console.warn("[mcp] revalidate failed", (err as Error).message);
  }
}

export async function listAccessibleStores(access: Access): Promise<Store[]> {
  if (!access.storeIds.length) return [];
  const snaps = await db().getAll(...access.storeIds.map((id) => db().doc(`stores/${id}`)));
  return snaps
    .filter((s) => s.exists && s.get("ownerId") === access.uid)
    .map((s) => storeFromData(s.id, s.data() ?? {}));
}

/** "jr-demo", "/jr-demo" or "https://<site>/jr-demo" -> "jr-demo". */
export function normalizeStoreRef(ref: string): string {
  let value = ref.trim();
  if (value.startsWith(OAUTH_ISSUER)) value = value.slice(OAUTH_ISSUER.length);
  return value.replace(/^\/+|\/+$/g, "");
}

/** Accepts a store id or slug; it must be granted to this connection and owned by the user. */
export async function resolveStore(access: Access, rawRef: string): Promise<Store> {
  const ref = normalizeStoreRef(rawRef);
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(ref)) {
    throw new ToolError(`"${rawRef}" is not a store id or slug. Use the id or slug from list_stores, e.g. "jr-demo".`);
  }
  let storeId = ref;
  if (!access.storeIds.includes(ref)) {
    const slugRef = ref.toLowerCase();
    const slug = SLUG_PATTERN.test(slugRef) ? await db().doc(`slugs/${slugRef}`).get() : null;
    storeId = slug?.exists ? String(slug.get("storeId")) : "";
  }
  if (!storeId || !access.storeIds.includes(storeId)) {
    throw new ToolError(
      `Store "${ref}" is not available to this connection. Call list_stores to see the stores you can use. The owner can give access to another store by reconnecting this connector and ticking it.`,
    );
  }
  const snap = await db().doc(`stores/${storeId}`).get();
  if (!snap.exists || snap.get("ownerId") !== access.uid) {
    throw new ToolError(`Store "${ref}" is no longer available to this account.`);
  }
  return storeFromData(snap.id, snap.data() ?? {});
}

export function storeSummary(store: Store) {
  return {
    id: store.id,
    slug: store.slug,
    name: store.name,
    publicUrl: absoluteUrl(`/${store.slug}`),
    currency: store.currency,
    showPrices: store.showPrices,
  };
}

async function loadCategories(storeId: string): Promise<Category[]> {
  const snap = await db().collection(`stores/${storeId}/categories`).get();
  return snap.docs.map((d) => categoryFromData(d.id, d.data())).sort((a, b) => a.order - b.order);
}

async function loadItems(storeId: string): Promise<Item[]> {
  const snap = await db().collection(`stores/${storeId}/items`).get();
  return snap.docs.map((d) => itemFromData(d.id, d.data())).sort((a, b) => a.order - b.order);
}

async function loadCategory(storeId: string, categoryId: string): Promise<Category> {
  const snap = await db().doc(`stores/${storeId}/categories/${categoryId}`).get();
  if (!snap.exists) throw new ToolError(`Category "${categoryId}" not found. Call get_catalog to see category ids.`);
  return categoryFromData(snap.id, snap.data() ?? {});
}

async function loadItem(storeId: string, itemId: string): Promise<Item> {
  const snap = await db().doc(`stores/${storeId}/items/${itemId}`).get();
  if (!snap.exists) throw new ToolError(`Item "${itemId}" not found. Call get_catalog to see item ids.`);
  return itemFromData(snap.id, snap.data() ?? {});
}

export async function getCatalog(store: Store, categoryId?: string) {
  const [allCategories, allItems] = await Promise.all([loadCategories(store.id), loadItems(store.id)]);
  const categories = categoryId ? allCategories.filter((c) => c.id === categoryId) : allCategories;
  if (categoryId && !categories.length) throw new ToolError(`Category "${categoryId}" not found. Call get_catalog without categoryId to see ids.`);
  const relevant = allItems.filter((i) => categories.some((c) => c.id === i.categoryId));
  const truncated = !categoryId && relevant.length > CATALOG_OVERVIEW_ITEM_LIMIT;
  const items = truncated ? relevant.slice(0, CATALOG_OVERVIEW_ITEM_LIMIT) : relevant;
  return {
    store: storeSummary(store),
    ...(truncated ? { note: `Showing ${CATALOG_OVERVIEW_ITEM_LIMIT} of ${relevant.length} items. Pass categoryId to see one category in full.` } : {}),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      visible: c.visible,
      ...(categoryId ? { description: c.description } : {}),
      sections: c.sections.map((s) => ({ id: s.id, name: s.name, visible: s.visible })),
      items: items
        .filter((i) => i.categoryId === c.id)
        .map((i) => ({ id: i.id, name: i.name, code: i.code, sectionId: i.sectionId, visible: i.visible, photos: i.images.length })),
    })),
  };
}

export async function getItemDetail(store: Store, itemId: string) {
  const item = await loadItem(store.id, itemId);
  const category = await loadCategory(store.id, item.categoryId).catch(() => null);
  return {
    ...item,
    images: item.images.map((i) => i.url),
    categoryName: category?.name ?? null,
    sectionName: category?.sections.find((s) => s.id === item.sectionId)?.name ?? null,
    publicUrl: category && item.visible && category.visible ? absoluteUrl(`/${store.slug}/${category.slug}/${item.slug}`) : null,
  };
}

// ---------- categories and sections ----------

export async function createCategory(store: Store, input: { name: string; description?: string }) {
  const col = db().collection(`stores/${store.id}/categories`);
  const ref = col.doc();
  // Reading the category list inside the transaction makes concurrent creates conflict and retry,
  // so parallel tool calls can't end up with the same slug.
  const created = await db().runTransaction(async (tx) => {
    const snap = await tx.get(col);
    const categories = snap.docs.map((d) => categoryFromData(d.id, d.data()));
    if (categories.length >= MAX_CATEGORIES) throw new ToolError(`A store can have at most ${MAX_CATEGORIES} categories.`);
    const taken = new Set(categories.map((c) => c.slug));
    const base = slugify(input.name) || "category";
    let slug = uniqueSlug(isReservedCategorySlug(base) ? `${base}-1` : base, taken);
    if (isReservedCategorySlug(slug)) slug = uniqueSlug(`${slug}-x`, taken);
    tx.create(ref, {
      name: input.name,
      slug,
      image: null,
      description: input.description ?? "",
      order: categories.length ? Math.max(...categories.map((c) => c.order)) + 1 : 0,
      visible: false,
      sections: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { id: ref.id, name: input.name, slug, visible: false };
  });
  revalidateStore(store);
  return created;
}

export async function updateCategory(store: Store, categoryId: string, patch: { name?: string; description?: string }) {
  await loadCategory(store.id, categoryId);
  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  await db().doc(`stores/${store.id}/categories/${categoryId}`).update(update);
  revalidateStore(store);
  return { id: categoryId, ...patch };
}

export async function addSection(store: Store, categoryId: string, name: string) {
  const ref = db().doc(`stores/${store.id}/categories/${categoryId}`);
  const section = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ToolError(`Category "${categoryId}" not found. Call get_catalog to see category ids.`);
    const sections = categoryFromData(snap.id, snap.data() ?? {}).sections;
    if (sections.length >= 50) throw new ToolError("A category can have at most 50 sections.");
    const existing = sections.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const created = { id: randomId(10), name, order: sections.length, visible: true };
    tx.update(ref, { sections: [...sections, created], updatedAt: FieldValue.serverTimestamp() });
    return created;
  });
  revalidateStore(store);
  return { categoryId, section: { id: section.id, name: section.name } };
}

// ---------- items ----------

export type ItemInput = {
  categoryId: string;
  sectionId?: string | null;
  name: string;
  code?: string;
  description?: string;
  specs?: Spec[];
  variants?: VariantGroup[];
  unit?: string;
  price?: number | null;
};

function checkSection(category: Category, sectionId: string | null | undefined): string | null {
  if (!sectionId) return null;
  if (!category.sections.some((s) => s.id === sectionId)) {
    throw new ToolError(`Section "${sectionId}" is not in category "${category.name}". Call get_catalog, or add_section first.`);
  }
  return sectionId;
}

export async function createItem(store: Store, input: ItemInput) {
  const category = await loadCategory(store.id, input.categoryId);
  const sectionId = checkSection(category, input.sectionId);
  const col = db().collection(`stores/${store.id}/items`);
  const ref = col.doc();
  const root = slugify([input.code, input.name].filter(Boolean).join(" ")) || "item";
  const stem = slugQueryStem(root);
  // Slug choice and create in one transaction (the range read makes parallel creates conflict).
  const slug = await db().runTransaction(async (tx) => {
    const count = (await tx.get(col.count())).data().count;
    if (count >= MAX_ITEMS) throw new ToolError(`A store can have at most ${MAX_ITEMS} items.`);
    const snap = await tx.get(col.where("slug", ">=", stem).where("slug", "<=", `${stem}\uf8ff`).select("slug"));
    const chosen = uniqueSlug(root, new Set(snap.docs.map((d) => String(d.get("slug")))));
    tx.create(ref, {
      categoryId: category.id,
      sectionId,
      name: input.name,
      slug: chosen,
      code: input.code ?? "",
      description: input.description ?? "",
      images: [],
      specs: input.specs ?? [],
      variants: input.variants ?? [],
      price: input.price ?? null,
      unit: input.unit ?? "pcs",
      // Appends after the existing items; the dashboard renumbers when the owner reorders.
      order: Date.now(),
      visible: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return chosen;
  });
  revalidateStore(store);
  return { id: ref.id, name: input.name, code: input.code ?? "", slug, categoryId: category.id, sectionId, visible: false };
}

export async function updateItem(store: Store, itemId: string, patch: Partial<ItemInput>) {
  const item = await loadItem(store.id, itemId);
  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  const moving = patch.categoryId !== undefined && patch.categoryId !== item.categoryId;
  if (moving || patch.sectionId !== undefined) {
    const category = await loadCategory(store.id, patch.categoryId ?? item.categoryId);
    const wantedSection = patch.sectionId !== undefined ? patch.sectionId : moving ? null : item.sectionId;
    const sectionId = checkSection(category, wantedSection);
    if (moving) {
      update.categoryId = category.id;
      update.order = Date.now(); // to the end of the new category, like the dashboard's move
    }
    if (sectionId !== item.sectionId) update.sectionId = sectionId;
  }
  for (const key of ["name", "code", "description", "specs", "variants", "unit", "price"] as const) {
    if (patch[key] !== undefined) update[key] = patch[key];
  }
  await db().doc(`stores/${store.id}/items/${itemId}`).update(update);
  revalidateStore(store);
  const changed = Object.keys(update).filter((k) => k !== "updatedAt");
  return { id: itemId, updatedFields: changed };
}

export async function setVisibility(store: Store, kind: "item" | "category", id: string, visible: boolean) {
  const path = kind === "item" ? `stores/${store.id}/items/${id}` : `stores/${store.id}/categories/${id}`;
  if (kind === "item") {
    const item = await loadItem(store.id, id);
    const category = await loadCategory(store.id, item.categoryId);
    await db().doc(path).update({ visible, updatedAt: FieldValue.serverTimestamp() });
    revalidateStore(store);
    const live = visible && category.visible;
    return {
      kind,
      id,
      visible,
      categoryVisible: category.visible,
      publicUrl: live ? absoluteUrl(`/${store.slug}/${category.slug}/${item.slug}`) : null,
      ...(visible && !category.visible
        ? { note: `The item is published, but its category "${category.name}" is hidden, so buyers can't see it yet. Publish the category too (kind "category", id "${category.id}") if the owner wants it live.` }
        : {}),
    };
  }
  const category = await loadCategory(store.id, id);
  await db().doc(path).update({ visible, updatedAt: FieldValue.serverTimestamp() });
  revalidateStore(store);
  const items = await db().collection(`stores/${store.id}/items`).where("categoryId", "==", id).where("visible", "==", true).count().get();
  return {
    kind,
    id,
    visible,
    visibleItems: items.data().count,
    publicUrl: visible ? absoluteUrl(`/${store.slug}/${category.slug}`) : null,
  };
}

// ---------- quotes ----------

export async function listQuotes(store: Store, status: QuoteStatus | undefined, limit: number) {
  let q = db().collection("quotes").where("storeId", "==", store.id);
  if (status) q = q.where("status", "==", status);
  const snap = await q.orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => {
    const quote = quoteFromData(d.id, d.data());
    return {
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      status: quote.status,
      createdAt: new Date(quote.createdAt).toISOString(),
      buyer: quote.buyer,
      itemCount: quote.items.length,
    };
  });
}

async function findQuote(store: Store, ref: string) {
  const byId = await db().doc(`quotes/${ref}`).get();
  if (byId.exists && byId.get("storeId") === store.id) return quoteFromData(byId.id, byId.data() ?? {});
  const byNumber = await db().collection("quotes").where("storeId", "==", store.id).where("quoteNumber", "==", ref.toUpperCase()).limit(1).get();
  if (!byNumber.empty) return quoteFromData(byNumber.docs[0].id, byNumber.docs[0].data());
  throw new ToolError(`Quote "${ref}" not found in this store. Use a quote number like JR-1001 or an id from list_quotes.`);
}

export async function getQuote(store: Store, ref: string) {
  const quote = await findQuote(store, ref);
  return { ...quote, createdAt: new Date(quote.createdAt).toISOString(), pageUrl: absoluteUrl(`/q/${quote.id}`) };
}

export async function updateQuoteStatus(store: Store, ref: string, status: QuoteStatus) {
  const quote = await findQuote(store, ref);
  await db().doc(`quotes/${quote.id}`).update({ status });
  return { id: quote.id, quoteNumber: quote.quoteNumber, status };
}
