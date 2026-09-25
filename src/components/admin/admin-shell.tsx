"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Inbox, LayoutGrid, LogOut, Settings, Share2 } from "lucide-react";
import { rememberStore, useStores } from "./stores-provider";
import { useAuth } from "./auth-provider";
import { signOut } from "@/lib/firebase/auth";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/en";
import type { Store } from "@/lib/schemas/types";
import type { ReactNode } from "react";

export function AdminShell({ store, children }: { store: Store; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { stores } = useStores();
  const { user } = useAuth();

  const base = `/dashboard/${store.id}`;
  const nav = [
    { href: base, label: t.dashboard.nav.catalog, icon: LayoutGrid, active: pathname === base || pathname.startsWith(`${base}/categories`) },
    { href: `${base}/quotes`, label: t.dashboard.nav.quotes, icon: Inbox, active: pathname.startsWith(`${base}/quotes`) },
    { href: `${base}/share`, label: t.dashboard.nav.share, icon: Share2, active: pathname.startsWith(`${base}/share`) },
    { href: `${base}/settings`, label: t.dashboard.nav.settings, icon: Settings, active: pathname.startsWith(`${base}/settings`) },
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      {/* Top bar (mobile) / sidebar (desktop) */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white md:static md:flex md:w-64 md:flex-col md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-3 py-2 md:flex-col md:items-stretch md:gap-3 md:px-4 md:py-4">
          <label className="sr-only" htmlFor="store-switcher">
            {t.dashboard.switchStore}
          </label>
          <select
            id="store-switcher"
            className="min-h-11 flex-1 rounded-xl border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900"
            value={store.id}
            onChange={(e) => {
              const id = e.target.value;
              if (id === "__new") {
                router.push("/dashboard/new");
                return;
              }
              rememberStore(id);
              router.push(`/dashboard/${id}`);
            }}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="__new">+ {t.dashboard.newStore}</option>
          </select>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              router.replace("/login");
            }}
            className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-2 text-sm text-gray-600 hover:bg-gray-100 md:justify-start md:px-3"
            title={user?.email ?? undefined}
          >
            <LogOut className="h-5 w-5" />
            <span className="hidden md:inline">{t.common.signOut}</span>
          </button>
        </div>
        <nav className="hidden md:block md:px-2" aria-label={t.common.menu}>
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium",
                n.active ? "bg-[var(--brand-soft)] text-[var(--brand-soft-text)]" : "text-gray-700 hover:bg-gray-100",
              )}
              aria-current={n.active ? "page" : undefined}
            >
              <n.icon className="h-5 w-5" />
              {n.label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="flex-1 pb-24 md:pb-8">{children}</div>

      {/* Bottom tabs on mobile */}
      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-gray-200 bg-white md:hidden"
        aria-label={t.common.menu}
      >
        {nav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs",
              n.active ? "text-[var(--brand)]" : "text-gray-500",
            )}
            aria-current={n.active ? "page" : undefined}
          >
            <n.icon className="h-5 w-5" />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
