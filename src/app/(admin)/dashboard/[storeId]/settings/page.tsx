"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/admin/store-context";
import { StoreForm } from "@/components/admin/store-form";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { PageTitle } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { deleteStore } from "@/lib/firebase/stores";
import { requestRevalidate } from "@/lib/firebase/revalidate";
import { t } from "@/lib/i18n/en";

export default function SettingsPage() {
  const store = useStore();
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-5">
      <PageTitle title={t.dashboard.nav.settings} subtitle={store.name} />
      <StoreForm key={store.id} mode="edit" store={store} />

      <section className="mt-10 rounded-2xl border border-red-200 p-4">
        <h2 className="text-sm font-semibold text-red-700">{t.store.deleteStore}</h2>
        <Button variant="danger" className="mt-3" onClick={() => setConfirm(true)}>
          {t.store.deleteStore}
        </Button>
      </section>

      <ConfirmDialog
        open={confirm}
        message={t.store.deleteStoreConfirm(store.name)}
        loading={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            const slug = store.slug;
            await deleteStore(store);
            void requestRevalidate(store.id, slug);
            router.replace("/dashboard");
          } catch (err) {
            console.error(err);
            toast(t.common.somethingWrong, "error");
            setBusy(false);
          }
        }}
      />
    </main>
  );
}
