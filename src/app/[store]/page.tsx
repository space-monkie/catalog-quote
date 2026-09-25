import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreBySlug, getVisibleCategories } from "@/lib/server/catalog";
import { absoluteUrl } from "@/lib/format";
import { t } from "@/lib/i18n/en";

export const revalidate = 60;

type Props = { params: Promise<{ store: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store: slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return {};
  const description = store.about || `${store.name} – ${t.app.tagline}`;
  return {
    title: { absolute: store.name },
    description,
    openGraph: {
      type: "website",
      siteName: store.name,
      title: store.name,
      description,
      url: absoluteUrl(`/${store.slug}`),
      images: store.logo ? [{ url: store.logo.url }] : [],
    },
  };
}

export default async function StoreHomePage({ params }: Props) {
  const { store: slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const categories = await getVisibleCategories(store.id);

  return (
    <div>
      <section className="flex flex-col items-center py-6 text-center">
        {store.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.logo.url} alt={store.name} className="mb-4 h-24 w-24 rounded-2xl object-cover" width={96} height={96} />
        )}
        <h1 className="text-2xl font-semibold text-gray-900">{store.name}</h1>
        {store.about && <p className="mt-2 max-w-md text-sm text-gray-600">{store.about}</p>}
      </section>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{t.public.categories}</h2>
      {categories.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">{t.public.noCategories}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {categories.map((c) => (
            <li key={c.id}>
              <Link href={`/${store.slug}/${c.slug}`} className="block overflow-hidden rounded-2xl border border-gray-200 bg-white focus-visible:outline-2 focus-visible:outline-[var(--brand)]">
                <div className="aspect-[4/3] bg-[var(--brand-soft)]">
                  {c.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                </div>
                <div className="px-3 py-2">
                  <p className="line-clamp-2 text-sm font-medium text-gray-900">{c.name}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
