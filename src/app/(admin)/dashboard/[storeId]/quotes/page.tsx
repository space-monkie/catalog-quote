"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/components/admin/store-context";
import { Badge, EmptyState, ErrorBox, PageTitle } from "@/components/ui/misc";
import { PageSpinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { listenQuotes } from "@/lib/firebase/quotes";
import { formatDate } from "@/lib/format";
import { QUOTE_STATUSES, type Quote, type QuoteStatus } from "@/lib/schemas/types";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/en";

const PAGE = 30;

function statusTone(s: QuoteStatus) {
  return s === "new" ? "brand" : s === "contacted" ? "amber" : "gray";
}

export default function QuotesPage() {
  const store = useStore();
  const [status, setStatus] = useState<QuoteStatus | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [result, setResult] = useState<{ key: string; quotes: Quote[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryKey = `${store.id}|${status ?? "all"}|${limit}`;
  const quotes = result?.key === queryKey ? result.quotes : null;

  useEffect(() => {
    return listenQuotes(store.id, status, limit, (list) => setResult({ key: queryKey, quotes: list }), (e) => setError(e.message));
  }, [store.id, status, limit, queryKey]);

  const filters: { value: QuoteStatus | null; label: string }[] = [
    { value: null, label: t.quotes.all },
    ...QUOTE_STATUSES.map((s) => ({ value: s, label: t.quotes.statuses[s] })),
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <PageTitle title={t.quotes.inbox} subtitle={store.name} />
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label={t.quotes.status}>
        {filters.map((f) => (
          <button
            key={f.label}
            type="button"
            role="tab"
            aria-selected={status === f.value}
            onClick={() => {
              setStatus(f.value);
              setLimit(PAGE);
            }}
            className={cn(
              "min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium",
              status === f.value ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-text)]" : "border-gray-300 bg-white text-gray-700",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <ErrorBox message={error} />}
      {!error && !quotes && <PageSpinner />}
      {quotes && quotes.length === 0 && <EmptyState title={t.quotes.empty} hint={t.quotes.emptyHint} />}
      {quotes && quotes.length > 0 && (
        <ul className="space-y-2">
          {quotes.map((q) => (
            <li key={q.id}>
              <Link href={`/dashboard/${store.id}/quotes/${q.id}`} className="flex min-h-16 items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium text-gray-900">
                    <span>{q.quoteNumber}</span>
                    <Badge tone={statusTone(q.status)}>{t.quotes.statuses[q.status]}</Badge>
                  </p>
                  <p className="truncate text-sm text-gray-600">
                    {q.buyer.name} · {q.buyer.country} · {t.catalog.itemsCount(q.items.length)}
                  </p>
                  <p className="text-xs text-gray-400">{formatDate(q.createdAt)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {quotes && quotes.length >= limit && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
            {t.quotes.loadMore}
          </Button>
        </div>
      )}
    </main>
  );
}
