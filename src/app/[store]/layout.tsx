import type { CSSProperties, ReactNode } from "react";
import { notFound } from "next/navigation";
import { getStoreBySlug, toPublicStore } from "@/lib/server/catalog";
import { brandCssVars } from "@/lib/color";
import { QuoteListProvider } from "@/lib/quote-list";
import { StoreHeader } from "@/components/public/store-header";
import { FloatingQuoteButton } from "@/components/public/floating-quote-button";
import { t } from "@/lib/i18n/en";

export const revalidate = 60;

// No pages are built ahead of time; each one is rendered on first visit, then cached
// (ISR) and refreshed every `revalidate` seconds or when the owner saves.
export function generateStaticParams() {
  return [];
}

export default async function StoreLayout({ children, params }: { children: ReactNode; params: Promise<{ store: string }> }) {
  const { store: slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const pub = toPublicStore(store);

  return (
    <div style={brandCssVars(store.brandColor) as CSSProperties} className="flex min-h-full flex-1 flex-col bg-white">
      <QuoteListProvider storeSlug={store.slug}>
        <StoreHeader store={pub} />
        <main id="content" className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4">
          {children}
        </main>
        <footer className="pb-24 pt-6 text-center text-xs text-gray-400">
          {t.public.poweredBy} {t.app.name}
        </footer>
        <FloatingQuoteButton storeSlug={store.slug} />
      </QuoteListProvider>
    </div>
  );
}
