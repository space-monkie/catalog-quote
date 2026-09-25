"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { lastStoreId, useStores } from "@/components/admin/stores-provider";
import { PageSpinner } from "@/components/ui/spinner";
import { ErrorBox } from "@/components/ui/misc";

export default function DashboardIndex() {
  const { stores, loading, error } = useStores();
  const router = useRouter();

  useEffect(() => {
    if (loading || error) return;
    if (!stores.length) {
      router.replace("/dashboard/new");
      return;
    }
    const remembered = lastStoreId();
    const target = stores.find((s) => s.id === remembered) ?? stores[0];
    router.replace(`/dashboard/${target.id}`);
  }, [stores, loading, error, router]);

  if (error) return <ErrorBox message={error} />;
  return <PageSpinner />;
}
