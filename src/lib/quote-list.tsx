"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { VariantGroup } from "@/lib/schemas/types";
import { useHydrated, useStoredValue } from "@/lib/local-storage";

// The buyer's quote list lives in localStorage, one list per store.

export type QuoteListEntry = {
  key: string;
  itemId: string;
  name: string;
  code: string;
  unit: string;
  thumbUrl: string | null;
  categorySlug: string;
  itemSlug: string;
  variants: VariantGroup[];
  selectedOptions: Record<string, string>;
  qty: number;
};

export type NewQuoteListEntry = Omit<QuoteListEntry, "key">;
export type BuyerMemory = { name: string; country: string };
export type LastQuote = { quoteId: string; quoteNumber: string; whatsappUrl: string; quoteUrl: string; at: number };

export const listKey = (storeSlug: string) => `cq:quote:${storeSlug}`;
export const lastQuoteKey = (storeSlug: string) => `cq:last-quote:${storeSlug}`;
export const BUYER_KEY = "cq:buyer";
export const EMPTY_ENTRIES: QuoteListEntry[] = [];
export const EMPTY_BUYER: BuyerMemory = { name: "", country: "" };

export function entryKey(itemId: string, selectedOptions: Record<string, string>): string {
  const opts = Object.keys(selectedOptions)
    .sort()
    .map((k) => `${k}=${selectedOptions[k]}`)
    .join("&");
  return `${itemId}::${opts}`;
}

type QuoteListContextValue = {
  storeSlug: string;
  entries: QuoteListEntry[];
  hydrated: boolean;
  count: number;
  add: (entry: NewQuoteListEntry) => void;
  setQty: (key: string, qty: number) => void;
  setOptions: (key: string, selectedOptions: Record<string, string>) => void;
  remove: (key: string) => void;
  removeMany: (keys: string[]) => void;
  clear: () => void;
};

const QuoteListContext = createContext<QuoteListContextValue | null>(null);

export function QuoteListProvider({ storeSlug, children }: { storeSlug: string; children: ReactNode }) {
  const [entries, update] = useStoredValue<QuoteListEntry[]>(listKey(storeSlug), EMPTY_ENTRIES);
  const hydrated = useHydrated();

  const add = useCallback(
    (entry: NewQuoteListEntry) => {
      const key = entryKey(entry.itemId, entry.selectedOptions);
      update((prev) => {
        const existing = prev.find((e) => e.key === key);
        if (existing) return prev.map((e) => (e.key === key ? { ...e, qty: Math.min(99999, e.qty + entry.qty) } : e));
        return [...prev, { ...entry, key }];
      });
    },
    [update],
  );

  const setQty = useCallback(
    (key: string, qty: number) => update((prev) => prev.map((e) => (e.key === key ? { ...e, qty: Math.max(1, Math.min(99999, qty)) } : e))),
    [update],
  );

  const setOptions = useCallback(
    (key: string, selectedOptions: Record<string, string>) =>
      update((prev) => {
        const target = prev.find((e) => e.key === key);
        if (!target) return prev;
        const newKey = entryKey(target.itemId, selectedOptions);
        const clash = prev.find((e) => e.key === newKey && e.key !== key);
        const without = prev.filter((e) => e.key !== key && e.key !== newKey);
        const merged: QuoteListEntry = { ...target, key: newKey, selectedOptions, qty: target.qty + (clash?.qty ?? 0) };
        const index = prev.findIndex((e) => e.key === key);
        without.splice(Math.min(index, without.length), 0, merged);
        return without;
      }),
    [update],
  );

  const remove = useCallback((key: string) => update((prev) => prev.filter((e) => e.key !== key)), [update]);
  const removeMany = useCallback((keys: string[]) => update((prev) => prev.filter((e) => !keys.includes(e.key))), [update]);
  const clear = useCallback(() => update(EMPTY_ENTRIES), [update]);

  const value = useMemo<QuoteListContextValue>(
    () => ({
      storeSlug,
      entries,
      hydrated,
      count: entries.reduce((sum, e) => sum + e.qty, 0),
      add,
      setQty,
      setOptions,
      remove,
      removeMany,
      clear,
    }),
    [storeSlug, entries, hydrated, add, setQty, setOptions, remove, removeMany, clear],
  );

  return <QuoteListContext.Provider value={value}>{children}</QuoteListContext.Provider>;
}

export function useQuoteList(): QuoteListContextValue {
  const ctx = useContext(QuoteListContext);
  if (!ctx) throw new Error("useQuoteList must be used inside QuoteListProvider");
  return ctx;
}
