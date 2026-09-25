import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuoteById } from "@/lib/server/quotes";
import { getStoreByIdFresh } from "@/lib/server/catalog";
import { brandCssVars } from "@/lib/color";
import { formatDate } from "@/lib/format";
import { formatSelectedOptions } from "@/lib/whatsapp";
import { buttonClass } from "@/components/ui/button";
import { t } from "@/lib/i18n/en";

// Unguessable id; rendered fresh on every request and never indexed.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ quoteId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { quoteId } = await params;
  const quote = await getQuoteById(quoteId);
  return { title: { absolute: quote ? t.quotePage.title(quote.quoteNumber) : t.errors.notFoundTitle }, robots: { index: false, follow: false } };
}

export default async function PublicQuotePage({ params }: Props) {
  const { quoteId } = await params;
  const quote = await getQuoteById(quoteId);
  if (!quote) notFound();
  const store = await getStoreByIdFresh(quote.storeId);
  if (!store) notFound();

  return (
    <div style={brandCssVars(store.brandColor) as CSSProperties} className="flex min-h-full flex-1 flex-col bg-white">
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <div className="flex items-center gap-3">
          {store.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logo.thumbUrl} alt="" className="h-10 w-10 rounded-lg object-cover" width={40} height={40} />
          )}
          <p className="font-semibold text-gray-900">{store.name}</p>
        </div>

        <h1 className="mt-4 text-2xl font-semibold text-gray-900">{t.quotePage.title(quote.quoteNumber)}</h1>
        <p className="text-sm text-gray-500">
          {t.quotePage.sentOn} {formatDate(quote.createdAt)}
        </p>

        <section className="mt-5 rounded-2xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t.quotePage.from}</h2>
          <p className="mt-1 font-medium text-gray-900">{quote.buyer.name}</p>
          <p className="text-sm text-gray-600">{quote.buyer.country}</p>
          {quote.buyer.note && (
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-800">
              <span className="font-medium">{t.quotePage.note}: </span>
              {quote.buyer.note}
            </p>
          )}
        </section>

        <section className="mt-5 rounded-2xl border border-gray-200">
          <h2 className="px-4 pt-4 text-sm font-semibold uppercase tracking-wide text-gray-500">{t.quotePage.items}</h2>
          <ol className="divide-y divide-gray-100">
            {quote.items.map((it, i) => (
              <li key={`${it.itemId}-${i}`} className="flex items-center gap-3 px-4 py-3">
                <span className="w-5 text-sm text-gray-400">{i + 1}.</span>
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                  {it.thumbUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900">{it.name}</p>
                  <p className="text-xs text-gray-500">{[it.code, formatSelectedOptions(it.selectedOptions)].filter(Boolean).join(" · ")}</p>
                </div>
                <p className="shrink-0 text-sm text-gray-800">
                  × {it.qty} {it.unit}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <Link href={`/${store.slug}`} className={buttonClass("secondary", "md", "mt-6")}>
          {t.quotePage.catalogLink}
        </Link>
      </main>
    </div>
  );
}
