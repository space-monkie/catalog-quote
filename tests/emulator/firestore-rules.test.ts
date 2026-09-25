import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch, deleteDoc, addDoc } from "firebase/firestore";
import { createTestEnv, validCategory, validItem, validStore } from "./helpers";

let env: RulesTestEnvironment;
const OWNER = "owner-uid";
const OTHER = "other-uid";
const STORE = "store-a";

beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

async function seedStore() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "stores", STORE), validStore(OWNER, "store-a"));
    await setDoc(doc(db, "slugs", "store-a"), { storeId: STORE });
    await setDoc(doc(db, "stores", STORE, "categories", "cat1"), validCategory());
    await setDoc(doc(db, "stores", STORE, "items", "item1"), validItem("cat1"));
    await setDoc(doc(db, "quotes", "quote1"), {
      storeId: STORE,
      quoteNumber: "TS-1001",
      buyer: { name: "A", country: "India", note: "" },
      items: [],
      status: "new",
      createdAt: new Date(),
    });
  });
}

describe("anonymous clients", () => {
  it("cannot read anything", async () => {
    await seedStore();
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "stores", STORE)));
    await assertFails(getDoc(doc(db, "stores", STORE, "categories", "cat1")));
    await assertFails(getDoc(doc(db, "stores", STORE, "items", "item1")));
    await assertFails(getDoc(doc(db, "quotes", "quote1")));
    await assertFails(getDoc(doc(db, "slugs", "store-a")));
  });

  it("cannot create quotes", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, "quotes"), { storeId: STORE, status: "new" }));
  });
});

describe("store creation", () => {
  it("lets a signed-in user create a store together with its slug", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, "stores", "new-store"), validStore(OWNER, "my-shop"));
    batch.set(doc(db, "slugs", "my-shop"), { storeId: "new-store" });
    await assertSucceeds(batch.commit());
  });

  it("rejects a store without the matching slug document", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(setDoc(doc(db, "stores", "new-store"), validStore(OWNER, "my-shop")));
  });

  it("rejects reserved slugs, foreign owners and a non-initial counter", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    for (const bad of [
      validStore(OWNER, "dashboard"),
      validStore(OTHER, "fine-slug"),
      { ...validStore(OWNER, "fine-slug"), quoteCounter: 5000 },
      { ...validStore(OWNER, "fine-slug"), whatsappNumber: "9876543210" },
    ]) {
      const batch = writeBatch(db);
      batch.set(doc(db, "stores", "new-store"), bad);
      batch.set(doc(db, "slugs", bad.slug), { storeId: "new-store" });
      await assertFails(batch.commit());
    }
  });

  it("rejects taking a slug that belongs to another store", async () => {
    await seedStore();
    const db = env.authenticatedContext(OTHER).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, "stores", "other-store"), validStore(OTHER, "store-a"));
    batch.set(doc(db, "slugs", "store-a"), { storeId: "other-store" });
    await assertFails(batch.commit());
  });
});

describe("store access", () => {
  beforeEach(seedStore);

  it("owner can read and list their stores", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(getDoc(doc(db, "stores", STORE)));
    await assertSucceeds(getDocs(query(collection(db, "stores"), where("ownerId", "==", OWNER))));
  });

  it("another user cannot read, list or update it", async () => {
    const db = env.authenticatedContext(OTHER).firestore();
    await assertFails(getDoc(doc(db, "stores", STORE)));
    await assertFails(getDocs(query(collection(db, "stores"), where("ownerId", "==", OWNER))));
    await assertFails(updateDoc(doc(db, "stores", STORE), { name: "Hacked" }));
  });

  it("owner can update settings but not the quote counter or owner", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(updateDoc(doc(db, "stores", STORE), { name: "Renamed", updatedAt: new Date() }));
    await assertFails(updateDoc(doc(db, "stores", STORE), { quoteCounter: 2000 }));
    await assertFails(updateDoc(doc(db, "stores", STORE), { ownerId: OTHER }));
  });

  it("owner can change the slug when the registry is updated in the same batch", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    const batch = writeBatch(db);
    batch.update(doc(db, "stores", STORE), { slug: "store-b", updatedAt: new Date() });
    batch.delete(doc(db, "slugs", "store-a"));
    batch.set(doc(db, "slugs", "store-b"), { storeId: STORE });
    await assertSucceeds(batch.commit());
    await assertFails(updateDoc(doc(db, "stores", STORE), { slug: "store-c" }));
  });
});

describe("catalog documents", () => {
  beforeEach(seedStore);

  it("owner can write valid categories and items", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(setDoc(doc(db, "stores", STORE, "categories", "cat2"), validCategory()));
    await assertSucceeds(setDoc(doc(db, "stores", STORE, "items", "item2"), validItem("cat2")));
    await assertSucceeds(updateDoc(doc(db, "stores", STORE, "items", "item2"), { visible: false }));
    await assertSucceeds(deleteDoc(doc(db, "stores", STORE, "items", "item2")));
  });

  it("rejects malformed documents", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(setDoc(doc(db, "stores", STORE, "categories", "cat2"), { ...validCategory(), name: "" }));
    await assertFails(setDoc(doc(db, "stores", STORE, "categories", "cat2"), { ...validCategory(), slug: "quote" }));
    await assertFails(setDoc(doc(db, "stores", STORE, "items", "item2"), { ...validItem("cat1"), price: -1 }));
    await assertFails(setDoc(doc(db, "stores", STORE, "items", "item2"), { ...validItem("cat1"), extra: true }));
  });

  it("other users cannot read or write the catalog", async () => {
    const db = env.authenticatedContext(OTHER).firestore();
    await assertFails(getDocs(collection(db, "stores", STORE, "items")));
    await assertFails(setDoc(doc(db, "stores", STORE, "items", "item9"), validItem("cat1")));
  });
});

describe("quotes", () => {
  beforeEach(seedStore);

  it("owner can read, list and change status only", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(getDoc(doc(db, "quotes", "quote1")));
    await assertSucceeds(getDocs(query(collection(db, "quotes"), where("storeId", "==", STORE))));
    await assertSucceeds(updateDoc(doc(db, "quotes", "quote1"), { status: "contacted" }));
    await assertFails(updateDoc(doc(db, "quotes", "quote1"), { status: "bogus" }));
    await assertFails(updateDoc(doc(db, "quotes", "quote1"), { quoteNumber: "TS-1" }));
    await assertFails(deleteDoc(doc(db, "quotes", "quote1")));
  });

  it("other users and owners cannot create quotes directly", async () => {
    const other = env.authenticatedContext(OTHER).firestore();
    await assertFails(getDoc(doc(other, "quotes", "quote1")));
    await assertFails(getDocs(query(collection(other, "quotes"), where("storeId", "==", STORE))));
    const owner = env.authenticatedContext(OWNER).firestore();
    await assertFails(setDoc(doc(owner, "quotes", "quote2"), { storeId: STORE, status: "new" }));
  });
});
