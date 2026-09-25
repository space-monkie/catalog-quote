"use client";

import { useEffect, type ReactNode } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { rememberStore, useStores } from "@/components/admin/stores-provider";
import { StoreProvider } from "@/components/admin/store-context";
import { AdminShell } from "@/components/admin/admin-shell";
import { PageSpinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { t } from "@/lib/i18n/en";

export default function StoreDashboardLayout({ children }: { children: ReactNode }) {
  const { storeId } = useParams<{ storeId: string }>();
  const { stores, loading } = useStores();
  const store = stores.find((s) => s.id === storeId) ?? null;

  useEffect(() => {
    if (store) rememberStore(store.id);
  }, [store]);

  if (loading && !store) return <PageSpinner />;
  if (!store) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-10">
        <EmptyState
          title={t.dashboard.storeNotFound}
          hint={t.dashboard.notOwner}
          action={
            <Link href="/dashboard" className={buttonClass("secondary")}>
              {t.dashboard.stores}
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <StoreProvider value={store}>
      <AdminShell store={store}>{children}</AdminShell>
    </StoreProvider>
  );
}
