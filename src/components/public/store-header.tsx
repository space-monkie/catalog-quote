import Link from "next/link";
import type { PublicStore } from "@/lib/schemas/types";
import { t } from "@/lib/i18n/en";

export function StoreHeader({ store }: { store: PublicStore }) {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        {t.public.skipToContent}
      </a>
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
        <Link href={`/${store.slug}`} className="flex min-h-11 items-center gap-2">
          {store.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logo.thumbUrl} alt="" className="h-9 w-9 rounded-lg object-cover" width={36} height={36} />
          ) : (
            <span
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--brand)] text-sm font-semibold text-[var(--brand-text)]"
              aria-hidden="true"
            >
              {store.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="truncate text-base font-semibold text-gray-900">{store.name}</span>
        </Link>
      </div>
    </header>
  );
}
