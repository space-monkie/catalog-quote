"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StoreForm } from "@/components/admin/store-form";
import { rememberStore, useStores } from "@/components/admin/stores-provider";
import { t } from "@/lib/i18n/en";

export default function NewStorePage() {
  const router = useRouter();
  const { stores } = useStores();
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6">
      {stores.length > 0 && (
        <Link href="/dashboard" className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-gray-600">
          <ArrowLeft className="h-4 w-4" /> {t.common.back}
        </Link>
      )}
      <h1 className="text-2xl font-semibold text-gray-900">{stores.length ? t.dashboard.newStore : t.dashboard.createFirstStore}</h1>
      <p className="mt-1 text-sm text-gray-500">{t.dashboard.createFirstStoreHint}</p>
      <div className="mt-6">
        <StoreForm
          mode="create"
          onSaved={(id) => {
            rememberStore(id);
            router.replace(`/dashboard/${id}`);
          }}
        />
      </div>
    </main>
  );
}
