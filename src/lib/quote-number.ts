// Per-store sequential quote numbers, e.g. JR-1001.
// The store document keeps `quoteCounter`; the server increments it inside a
// Firestore transaction (see src/lib/server/quotes.ts) so numbers never repeat.

/** Counter value a store starts with; the first quote gets START + 1. */
export const QUOTE_COUNTER_START = 1000;

export function nextQuoteCounter(current: number | null | undefined): number {
  const base =
    typeof current === "number" && Number.isFinite(current) && current >= QUOTE_COUNTER_START
      ? Math.floor(current)
      : QUOTE_COUNTER_START;
  return base + 1;
}

export function formatQuoteNumber(prefix: string, counter: number): string {
  const clean = (prefix || "Q").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "Q";
  return `${clean}-${counter}`;
}
