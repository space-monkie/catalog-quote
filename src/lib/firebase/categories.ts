import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  updateDoc,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { firebaseClient } from "./client";
import { categoryFromData } from "./converters";
import { deleteImageAssets } from "./storage";
import type { CategoryForm } from "@/lib/schemas";
import type { Category, Item, Section } from "@/lib/schemas/types";
import { randomId } from "@/lib/ids";

export function listenCategories(
  storeId: string,
  cb: (categories: Category[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const { db } = firebaseClient();
  const q = query(collection(db, "stores", storeId, "categories"), orderBy("order"));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => categoryFromData(d.id, d.data()))), onError);
}

export function listenCategory(
  storeId: string,
  categoryId: string,
  cb: (category: Category | null) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const { db } = firebaseClient();
  return onSnapshot(
    doc(db, "stores", storeId, "categories", categoryId),
    (snap) => cb(snap.exists() ? categoryFromData(snap.id, snap.data()) : null),
    onError,
  );
}

export async function createCategory(storeId: string, form: CategoryForm, order: number): Promise<string> {
  const { db } = firebaseClient();
  const ref = doc(collection(db, "stores", storeId, "categories"));
  await setDoc(ref, {
    name: form.name,
    slug: form.slug,
    image: form.image ?? null,
    description: form.description ?? "",
    order,
    visible: form.visible,
    sections: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCategory(storeId: string, categoryId: string, form: CategoryForm): Promise<void> {
  const { db } = firebaseClient();
  await updateDoc(doc(db, "stores", storeId, "categories", categoryId), {
    name: form.name,
    slug: form.slug,
    image: form.image ?? null,
    description: form.description ?? "",
    visible: form.visible,
    updatedAt: serverTimestamp(),
  });
}

export async function setCategoryVisible(storeId: string, categoryId: string, visible: boolean): Promise<void> {
  const { db } = firebaseClient();
  await updateDoc(doc(db, "stores", storeId, "categories", categoryId), { visible, updatedAt: serverTimestamp() });
}

/** Deletes the category, its items and all their images. */
export async function deleteCategory(storeId: string, category: Category, items: Item[]): Promise<void> {
  const { db } = firebaseClient();
  await deleteImageAssets([category.image, ...items.flatMap((i) => i.images)]);
  const batch = writeBatch(db);
  items.forEach((i) => batch.delete(doc(db, "stores", storeId, "items", i.id)));
  batch.delete(doc(db, "stores", storeId, "categories", category.id));
  await batch.commit();
}

export async function reorderCategories(storeId: string, orderedIds: string[]): Promise<void> {
  const { db } = firebaseClient();
  const batch = writeBatch(db);
  orderedIds.forEach((id, index) => batch.update(doc(db, "stores", storeId, "categories", id), { order: index }));
  await batch.commit();
}

export async function saveSections(storeId: string, categoryId: string, sections: Section[]): Promise<void> {
  const { db } = firebaseClient();
  const normalized = sections.map((s, index) => ({ id: s.id, name: s.name, order: index, visible: s.visible }));
  await updateDoc(doc(db, "stores", storeId, "categories", categoryId), {
    sections: normalized,
    updatedAt: serverTimestamp(),
  });
}

export function newSection(name: string, order: number): Section {
  return { id: randomId(10), name, order, visible: true };
}
