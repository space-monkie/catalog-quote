import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { firebaseClient } from "./client";
import { storeFromData, categoryFromData, itemFromData } from "./converters";
import { deleteImageAssets } from "./storage";
import type { StoreForm } from "@/lib/schemas";
import type { Store } from "@/lib/schemas/types";
import { QUOTE_COUNTER_START } from "@/lib/quote-number";

export function listenStores(uid: string, cb: (stores: Store[]) => void, onError?: (e: Error) => void): Unsubscribe {
  const { db } = firebaseClient();
  const q = query(collection(db, "stores"), where("ownerId", "==", uid));
  return onSnapshot(
    q,
    (snap) => {
      const stores = snap.docs.map((d) => storeFromData(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name));
      cb(stores);
    },
    onError,
  );
}

export function listenStore(storeId: string, cb: (store: Store | null) => void, onError?: (e: Error) => void): Unsubscribe {
  const { db } = firebaseClient();
  return onSnapshot(
    doc(db, "stores", storeId),
    (snap) => cb(snap.exists() ? storeFromData(snap.id, snap.data()) : null),
    onError,
  );
}

export async function isSlugAvailable(slug: string, ownStoreId?: string): Promise<boolean> {
  const { db } = firebaseClient();
  const snap = await getDoc(doc(db, "slugs", slug));
  if (!snap.exists()) return true;
  return ownStoreId ? snap.data().storeId === ownStoreId : false;
}

/** Creates the store and reserves its slug in one batch (rules verify both sides). */
export async function createStore(uid: string, form: StoreForm): Promise<string> {
  const { db } = firebaseClient();
  const storeRef = doc(collection(db, "stores"));
  const batch = writeBatch(db);
  batch.set(storeRef, {
    ownerId: uid,
    name: form.name,
    slug: form.slug,
    logo: form.logo ?? null,
    about: form.about ?? "",
    brandColor: form.brandColor,
    whatsappNumber: form.whatsappNumber,
    quotePrefix: form.quotePrefix,
    quoteCounter: QUOTE_COUNTER_START,
    showPrices: form.showPrices,
    currency: form.currency,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, "slugs", form.slug), { storeId: storeRef.id });
  await batch.commit();
  return storeRef.id;
}

/** Updates settings; a slug change swaps the slug registry entries in the same batch. */
export async function updateStore(store: Store, form: StoreForm): Promise<void> {
  const { db } = firebaseClient();
  const batch = writeBatch(db);
  batch.update(doc(db, "stores", store.id), {
    name: form.name,
    slug: form.slug,
    logo: form.logo ?? null,
    about: form.about ?? "",
    brandColor: form.brandColor,
    whatsappNumber: form.whatsappNumber,
    quotePrefix: form.quotePrefix,
    showPrices: form.showPrices,
    currency: form.currency,
    updatedAt: serverTimestamp(),
  });
  if (form.slug !== store.slug) {
    batch.delete(doc(db, "slugs", store.slug));
    batch.set(doc(db, "slugs", form.slug), { storeId: store.id });
  }
  await batch.commit();
}

/** Deletes catalog docs, their images, the slug and the store. Quotes are kept. */
export async function deleteStore(store: Store): Promise<void> {
  const { db } = firebaseClient();
  const [catSnap, itemSnap] = await Promise.all([
    getDocs(collection(db, "stores", store.id, "categories")),
    getDocs(collection(db, "stores", store.id, "items")),
  ]);
  const categories = catSnap.docs.map((d) => categoryFromData(d.id, d.data()));
  const items = itemSnap.docs.map((d) => itemFromData(d.id, d.data()));

  await deleteImageAssets([store.logo, ...categories.map((c) => c.image), ...items.flatMap((i) => i.images)]);

  const refs = [...catSnap.docs.map((d) => d.ref), ...itemSnap.docs.map((d) => d.ref)];
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  const last = writeBatch(db);
  last.delete(doc(db, "slugs", store.slug));
  last.delete(doc(db, "stores", store.id));
  await last.commit();
}
