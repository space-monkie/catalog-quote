"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useStore } from "@/components/admin/store-context";
import { Field, Select } from "@/components/ui/field";
import { EmptyState, ErrorBox } from "@/components/ui/misc";
import { PageSpinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { getQuoteForOwner, updateQuoteStatus } from "@/lib/firebase/quotes";
import { formatDate } from "@/lib/format";
import { formatSelectedOptions } from "@/lib/whatsapp";
import { QUOTE_STATUSES, type Quote, type QuoteStatus } from "@/lib/schemas/types";
import { t } from "@/lib/i18n/en";

export default function QuoteDetailPage() {
  const store = useStore();
  const { toast } = useToast();
  const { quoteId } = useParams<{ quoteId: string }>();
  const [quote, setQuote] = useState<Quote | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getQuoteForOwner(quoteId)
      .then((q) => setQuote(q && q.storeId === store.id ? q : null))
      .catch((e) => setError(e.message));
  }, [quoteId, store.id]);

  async function changeStatus(status: QuoteStatus) {
    if (!quote) return;
    const prev = quote.status;
    setQuote({ ...quote, status });
    try {
      await updateQuoteStatus(quote.id, status);
      toast(t.quotes.statusUpdated);
    } catch {
      setQuote({ ...quote, status: prev });
      toast(t.common.somethingWrong, "error");
    }
  }

  if (error) return <div className="p-4"><ErrorBox message={error} /></div>;
  if (quote === undefined) return <PageSpinner />;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5">
      <Link href={`/dashboard/${store.id}/quotes`} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-gray-600">
        <ArrowLeft className="h-4 w-4" /> {t.quotes.inbox}
      </Link>
      {!quote ? (
        <EmptyState title={t.quotes.notFound} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{quote.quoteNumber}</h1>
              <p className="text-sm text-gray-500">
                {t.quotes.received} {formatDate(quote.createdAt)}
              </p>
            </div>
            <a href={`/q/${quote.id}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--brand)]">
              <ExternalLink className="h-4 w-4" /> {t.quotes.openPublic}
            </a>
          </div>

          <div className="mb-5 max-w-xs">
            <Field label={t.quotes.status}>
              {(id) => (
                <Select id={id} value={quote.status} onChange={(e) => changeStatus(e.target.value as QuoteStatus)}>
                  {QUOTE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t.quotes.statuses[s]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{t.quotes.buyer}</h2>
            <dl className="space-y-1 text-sm">
              <div className="flex gap-2"><dt className="w-20 text-gray-500">{t.quote.name}</dt><dd className="text-gray-900">{quote.buyer.name}</dd></div>
              <div className="flex gap-2"><dt className="w-20 text-gray-500">{t.quotes.country}</dt><dd className="text-gray-900">{quote.buyer.country}</dd></div>
              {quote.buyer.note && (
                <div className="flex gap-2"><dt className="w-20 text-gray-500">{t.quotes.note}</dt><dd className="whitespace-pre-wrap text-gray-900">{quote.buyer.note}</dd></div>
              )}
            </dl>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white">
            <h2 className="px-4 pt-4 text-sm font-semibold uppercase tracking-wide text-gray-500">{t.quotes.items}</h2>
            <ul className="divide-y divide-gray-100">
              {quote.items.map((it, i) => (
                <li key={`${it.itemId}-${i}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    {it.thumbUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">{it.name}</p>
                    <p className="text-xs text-gray-500">
                      {[it.code, formatSelectedOptions(it.selectedOptions)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm text-gray-800">{t.quotes.itemLine(it.qty, it.unit)}</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
