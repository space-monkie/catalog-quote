import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { firebaseClient } from "./client";
import { quoteFromData } from "./converters";
import type { Quote, QuoteStatus } from "@/lib/schemas/types";

export function listenQuotes(
  storeId: string,
  status: QuoteStatus | null,
  max: number,
  cb: (quotes: Quote[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const { db } = firebaseClient();
  const constraints: QueryConstraint[] = [where("storeId", "==", storeId)];
  if (status) constraints.push(where("status", "==", status));
  constraints.push(orderBy("createdAt", "desc"), limit(max));
  return onSnapshot(
    query(collection(db, "quotes"), ...constraints),
    (snap) => cb(snap.docs.map((d) => quoteFromData(d.id, d.data()))),
    onError,
  );
}

export async function getQuoteForOwner(quoteId: string): Promise<Quote | null> {
  const { db } = firebaseClient();
  const snap = await getDoc(doc(db, "quotes", quoteId));
  return snap.exists() ? quoteFromData(snap.id, snap.data()) : null;
}

export async function updateQuoteStatus(quoteId: string, status: QuoteStatus): Promise<void> {
  const { db } = firebaseClient();
  await updateDoc(doc(db, "quotes", quoteId), { status });
}
