import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreBySlug, toPublicStore } from "@/lib/server/catalog";
import { QuotePage } from "@/components/public/quote-page";
import { t } from "@/lib/i18n/en";

export const revalidate = 60;

type Props = { params: Promise<{ store: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store: slug } = await params;
  const store = await getStoreBySlug(slug);
  return { title: { absolute: store ? `${t.quote.title} | ${store.name}` : t.quote.title }, robots: { index: false } };
}

export default async function StoreQuotePage({ params }: Props) {
  const { store: slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  return <QuotePage store={toPublicStore(store)} />;
}
