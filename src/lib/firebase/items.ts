import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  deleteDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { firebaseClient } from "./client";
import { itemFromData } from "./converters";
import { copyImageAsset, deleteImageAssets, imagePaths } from "./storage";
import type { ItemForm } from "@/lib/schemas";
import type { Item } from "@/lib/schemas/types";
import { slugify, uniqueSlug } from "@/lib/slug";

export function listenItems(storeId: string, cb: (items: Item[]) => void, onError?: (e: Error) => void): Unsubscribe {
  const { db } = firebaseClient();
  const q = query(collection(db, "stores", storeId, "items"), orderBy("order"));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => itemFromData(d.id, d.data()))), onError);
}

export function listenItemsInCategory(
  storeId: string,
  categoryId: string,
  cb: (items: Item[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const { db } = firebaseClient();
  const q = query(collection(db, "stores", storeId, "items"), where("categoryId", "==", categoryId));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => itemFromData(d.id, d.data())).sort((a, b) => a.order - b.order)),
    onError,
  );
}

export async function getItem(storeId: string, itemId: string): Promise<Item | null> {
  const { db } = firebaseClient();
  const snap = await getDoc(doc(db, "stores", storeId, "items", itemId));
  return snap.exists() ? itemFromData(snap.id, snap.data()) : null;
}

/** New item ids are created up front so photos can be uploaded before the first save. */
export function newItemId(storeId: string): string {
  const { db } = firebaseClient();
  return doc(collection(db, "stores", storeId, "items")).id;
}

/** Item slugs are unique per store. */
export async function ensureUniqueItemSlug(storeId: string, base: string, excludeItemId?: string): Promise<string> {
  const { db } = firebaseClient();
  const root = slugify(base) || "item";
  const taken = new Set<string>();
  // Only slugs that start with the root can collide; fetch them with a prefix range query.
  const q = query(
    collection(db, "stores", storeId, "items"),
    where("slug", ">=", root),
    where("slug", "<=", `${root}`),
  );
  const snap = await getDocs(q);
  snap.docs.forEach((d) => {
    if (d.id !== excludeItemId) taken.add(String(d.data().slug));
  });
  return uniqueSlug(root, taken);
}

function itemPayload(form: ItemForm) {
  return {
    categoryId: form.categoryId,
    sectionId: form.sectionId ?? null,
    name: form.name,
    slug: form.slug,
    code: form.code ?? "",
    description: form.description ?? "",
    images: form.images,
    specs: form.specs.filter((s) => s.label || s.value),
    variants: form.variants.filter((v) => v.name && v.options.length),
    price: form.price ?? null,
    unit: form.unit,
    visible: form.visible,
  };
}

export async function createItem(storeId: string, itemId: string, form: ItemForm, order: number): Promise<void> {
  const { db } = firebaseClient();
  await setDoc(doc(db, "stores", storeId, "items", itemId), {
    ...itemPayload(form),
    order,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateItem(storeId: string, itemId: string, form: ItemForm): Promise<void> {
  const { db } = firebaseClient();
  await updateDoc(doc(db, "stores", storeId, "items", itemId), { ...itemPayload(form), updatedAt: serverTimestamp() });
}

export async function setItemVisible(storeId: string, itemId: string, visible: boolean): Promise<void> {
  const { db } = firebaseClient();
  await updateDoc(doc(db, "stores", storeId, "items", itemId), { visible, updatedAt: serverTimestamp() });
}

export async function deleteItem(storeId: string, item: Item): Promise<void> {
  const { db } = firebaseClient();
  await deleteImageAssets(item.images);
  await deleteDoc(doc(db, "stores", storeId, "items", item.id));
}

/** Copies the item (and its photos, so deletes never affect the original). */
export async function duplicateItem(storeId: string, item: Item, copySuffix: string): Promise<string> {
  const { db } = firebaseClient();
  const newId = newItemId(storeId);
  const name = `${item.name} ${copySuffix}`.trim();
  const slug = await ensureUniqueItemSlug(storeId, `${item.slug}-copy`);
  let images = item.images;
  try {
    images = await Promise.all(item.images.map((img) => copyImageAsset(img, imagePaths.item(storeId, newId))));
  } catch (err) {
    console.warn("Could not copy photos, duplicating without them", err);
    images = [];
  }
  await setDoc(doc(db, "stores", storeId, "items", newId), {
    categoryId: item.categoryId,
    sectionId: item.sectionId,
    name,
    slug,
    code: item.code,
    description: item.description,
    images,
    specs: item.specs,
    variants: item.variants,
    price: item.price,
    unit: item.unit,
    order: item.order + 0.5,
    visible: item.visible,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return newId;
}

export async function moveItem(
  storeId: string,
  itemId: string,
  target: { categoryId: string; sectionId: string | null; order: number },
): Promise<void> {
  const { db } = firebaseClient();
  await updateDoc(doc(db, "stores", storeId, "items", itemId), { ...target, updatedAt: serverTimestamp() });
}

export async function reorderItems(storeId: string, orderedIds: string[]): Promise<void> {
  const { db } = firebaseClient();
  const batch = writeBatch(db);
  orderedIds.forEach((id, index) => batch.update(doc(db, "stores", storeId, "items", id), { order: index }));
  await batch.commit();
}
