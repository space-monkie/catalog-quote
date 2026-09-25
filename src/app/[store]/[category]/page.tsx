import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getStoreBySlug, getVisibleCategoryBySlug, getVisibleItemsForCategory } from "@/lib/server/catalog";
import { SectionTabs } from "@/components/public/section-tabs";
import { absoluteUrl } from "@/lib/format";
import type { Item, Section } from "@/lib/schemas/types";
import { t } from "@/lib/i18n/en";

export const revalidate = 60;

// No pages are built ahead of time; each one is rendered on first visit, then cached
// (ISR) and refreshed every `revalidate` seconds or when the owner saves.
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ store: string; category: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store: slug, category: catSlug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return {};
  const category = await getVisibleCategoryBySlug(store.id, catSlug);
  if (!category) return {};
  const title = `${category.name} | ${store.name}`;
  const description = category.description || `${category.name} – ${store.name}`;
  const image = category.image?.thumbUrl ?? store.logo?.thumbUrl;
  return {
    title: { absolute: title },
    description,
    openGraph: { type: "website", siteName: store.name, title, description, url: absoluteUrl(`/${store.slug}/${category.slug}`), images: image ? [{ url: image }] : [] },
  };
}

function ItemCard({ item, href }: { item: Item; href: string }) {
  const cover = item.images[0];
  return (
    <Link href={href} className="block overflow-hidden rounded-2xl border border-gray-200 bg-white focus-visible:outline-2 focus-visible:outline-[var(--brand)]">
      <div className="aspect-square bg-gray-100">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-gray-400">{t.public.noPhoto}</div>
        )}
      </div>
      <div className="px-3 py-2">
        <p className="line-clamp-2 text-sm font-medium text-gray-900">{item.name}</p>
        {item.code && <p className="mt-0.5 truncate text-xs text-gray-500">{item.code}</p>}
      </div>
    </Link>
  );
}

export default async function CategoryPage({ params }: Props) {
  const { store: slug, category: catSlug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const category = await getVisibleCategoryBySlug(store.id, catSlug);
  if (!category) notFound();
  const items = await getVisibleItemsForCategory(store.id, category.id);

  const groups: { section: Section | null; items: Item[] }[] = category.sections.map((s) => ({
    section: s,
    items: items.filter((i) => i.sectionId === s.id),
  }));
  const loose = items.filter((i) => !i.sectionId || !category.sections.some((s) => s.id === i.sectionId));
  if (loose.length) groups.push({ section: null, items: loose });
  const visibleGroups = groups.filter((g) => g.items.length > 0);
  const tabs = visibleGroups.map((g) => ({ id: g.section?.id ?? "other", name: g.section?.name ?? t.common.other }));

  return (
    <div>
      <Link href={`/${store.slug}`} className="-ml-1 inline-flex min-h-11 items-center gap-1 text-sm text-gray-600">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> {t.public.backToStore}
      </Link>
      <h1 className="mt-1 text-2xl font-semibold text-gray-900">{category.name}</h1>
      {category.description && <p className="mt-1 text-sm text-gray-600">{category.description}</p>}

      <SectionTabs sections={tabs} />

      {visibleGroups.length === 0 && (
        <p className="mt-6 rounded-2xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">{t.public.noItems}</p>
      )}

      {visibleGroups.map((g) => (
        <section key={g.section?.id ?? "other"} id={`section-${g.section?.id ?? "other"}`} className="scroll-mt-28 pt-5">
          {tabs.length > 1 && <h2 className="mb-2 text-lg font-semibold text-gray-900">{g.section?.name ?? t.common.other}</h2>}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {g.items.map((item) => (
              <li key={item.id}>
                <ItemCard item={item} href={`/${store.slug}/${category.slug}/${item.slug}`} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
