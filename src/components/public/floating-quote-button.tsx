"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { useQuoteList } from "@/lib/quote-list";
import { t } from "@/lib/i18n/en";

export function FloatingQuoteButton({ storeSlug }: { storeSlug: string }) {
  const { count, hydrated } = useQuoteList();
  const pathname = usePathname();
  const onQuotePage = pathname === `/${storeSlug}/quote`;
  if (!hydrated || count === 0 || onQuotePage) return null;
  return (
    <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4">
      <Link
        href={`/${storeSlug}/quote`}
        className="pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--brand)] px-5 text-base font-medium text-[var(--brand-text)] shadow-lg"
      >
        <ClipboardList className="h-5 w-5" aria-hidden="true" />
        {t.public.viewQuote}
        <span className="rounded-full bg-white/25 px-2 py-0.5 text-sm" aria-label={t.public.quoteButton(count)}>
          {count}
        </span>
      </Link>
    </div>
  );
}
