import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getApps, deleteApp } from "firebase-admin/app";
import { adminDb } from "@/lib/server/firebase-admin";
import { createQuote } from "@/lib/server/quotes";
import { QUOTE_COUNTER_START } from "@/lib/quote-number";

// Runs the real transaction against the Firestore emulator.
const STORE = "numbering-store";

beforeAll(async () => {
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= "demo-catalog-quote";
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run with: npm run test:rules (needs the Firestore emulator)");
  const db = adminDb();
  await db.doc(`stores/${STORE}`).set({
    ownerId: "owner",
    name: "Numbering",
    slug: "numbering",
    quotePrefix: "NB",
    quoteCounter: QUOTE_COUNTER_START,
  });
});

afterAll(async () => {
  await Promise.all(getApps().map((app) => deleteApp(app)));
});

describe("createQuote numbering", () => {
  it("assigns unique, sequential numbers under concurrency", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        createQuote({
          storeId: STORE,
          buyer: { name: `Buyer ${i}`, country: "India", note: "" },
          items: [{ itemId: "x", name: "X", code: "", selectedOptions: {}, qty: 1, unit: "pcs", thumbUrl: null }],
        }),
      ),
    );
    const numbers = results.map((r) => r.quoteNumber).sort();
    const expected = Array.from({ length: 12 }, (_, i) => `NB-${QUOTE_COUNTER_START + 1 + i}`).sort();
    expect(numbers).toEqual(expected);
    expect(new Set(results.map((r) => r.id)).size).toBe(12);

    const store = await adminDb().doc(`stores/${STORE}`).get();
    expect(store.get("quoteCounter")).toBe(QUOTE_COUNTER_START + 12);

    const saved = await adminDb().doc(`quotes/${results[0].id}`).get();
    expect(saved.exists).toBe(true);
    expect(saved.get("status")).toBe("new");
  });
});
