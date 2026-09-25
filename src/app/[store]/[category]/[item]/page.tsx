import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getStoreBySlug, getVisibleCategoryBySlug, getVisibleItemBySlug } from "@/lib/server/catalog";
import { Gallery } from "@/components/public/gallery";
import { AddToQuote } from "@/components/public/add-to-quote";
import { absoluteUrl, formatPrice } from "@/lib/format";
import { t } from "@/lib/i18n/en";

export const revalidate = 60;

type Props = { params: Promise<{ store: string; category: string; item: string }> };

async function load(params: Props["params"]) {
  const { store: slug, category: catSlug, item: itemSlug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return null;
  const category = await getVisibleCategoryBySlug(store.id, catSlug);
  if (!category) return null;
  const item = await getVisibleItemBySlug(store.id, category.id, itemSlug);
  if (!item) return null;
  return { store, category, item };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load(params);
  if (!data) return {};
  const { store, category, item } = data;
  const title = `${item.name}${item.code ? ` (${item.code})` : ""} | ${store.name}`;
  const description = item.description?.slice(0, 200) || `${item.name} – ${category.name} – ${store.name}`;
  const image = item.images[0]?.url ?? store.logo?.url;
  return {
    title: { absolute: title },
    description,
    openGraph: {
      type: "website",
      siteName: store.name,
      title,
      description,
      url: absoluteUrl(`/${store.slug}/${category.slug}/${item.slug}`),
      images: image ? [{ url: image }] : [],
    },
  };
}

export default async function ItemPage({ params }: Props) {
  const data = await load(params);
  if (!data) notFound();
  const { store, category, item } = data;
  const showPrice = store.showPrices && item.price != null;

  return (
    <article>
      <Link href={`/${store.slug}/${category.slug}`} className="-ml-1 inline-flex min-h-11 items-center gap-1 text-sm text-gray-600">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> {category.name}
      </Link>

      <div className="mt-2 grid gap-6 md:grid-cols-2">
        <Gallery images={item.images} alt={item.name} />

        <div>
          {item.code && <p className="text-sm font-medium text-[var(--brand-soft-text)]">{item.code}</p>}
          <h1 className="text-2xl font-semibold text-gray-900">{item.name}</h1>
          {showPrice && (
            <p className="mt-2 text-lg font-semibold text-gray-900">
              {formatPrice(item.price!, store.currency)} <span className="text-sm font-normal text-gray-500">/ {item.unit}</span>
            </p>
          )}

          <div className="mt-5 rounded-2xl border border-gray-200 p-4">
            <AddToQuote item={item} storeSlug={store.slug} categorySlug={category.slug} />
          </div>

          {item.description && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t.public.description}</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-700">{item.description}</p>
            </section>
          )}

          {item.specs.length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t.public.specs}</h2>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {item.specs.map((s, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <th scope="row" className="w-2/5 py-2 pr-3 text-left font-medium text-gray-600">
                        {s.label}
                      </th>
                      <td className="py-2 text-gray-900">{s.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}
