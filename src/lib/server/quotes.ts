import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";
import { quoteFromData } from "@/lib/firebase/converters";
import { randomId } from "@/lib/ids";
import { formatQuoteNumber, nextQuoteCounter } from "@/lib/quote-number";
import type { Quote, QuoteBuyer, QuoteItem } from "@/lib/schemas/types";

export type CreateQuoteInput = {
  storeId: string;
  buyer: QuoteBuyer;
  items: QuoteItem[];
};

/**
 * Creates the quote and assigns the next per-store number inside a transaction,
 * so concurrent buyers never receive the same number.
 */
export async function createQuote(input: CreateQuoteInput): Promise<{ id: string; quoteNumber: string }> {
  const db = adminDb();
  const id = randomId(20);
  const storeRef = db.doc(`stores/${input.storeId}`);
  const quoteRef = db.doc(`quotes/${id}`);

  const quoteNumber = await db.runTransaction(async (tx) => {
    const storeSnap = await tx.get(storeRef);
    if (!storeSnap.exists) throw new Error("store-not-found");
    const counter = nextQuoteCounter(storeSnap.get("quoteCounter") as number | undefined);
    const number = formatQuoteNumber(String(storeSnap.get("quotePrefix") ?? "Q"), counter);
    tx.update(storeRef, { quoteCounter: counter });
    tx.create(quoteRef, {
      storeId: input.storeId,
      quoteNumber: number,
      buyer: input.buyer,
      items: input.items,
      status: "new",
      createdAt: FieldValue.serverTimestamp(),
    });
    return number;
  });

  return { id, quoteNumber };
}

export async function getQuoteById(id: string): Promise<Quote | null> {
  const snap = await adminDb().doc(`quotes/${id}`).get();
  return snap.exists ? quoteFromData(snap.id, snap.data() ?? {}) : null;
}
