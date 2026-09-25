"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useStore } from "@/components/admin/store-context";
import { ItemForm } from "@/components/admin/item-form";
import { PageSpinner } from "@/components/ui/spinner";
import { EmptyState, ErrorBox } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { listenCategories } from "@/lib/firebase/categories";
import { getItem } from "@/lib/firebase/items";
import type { Category, Item } from "@/lib/schemas/types";
import { t } from "@/lib/i18n/en";

export default function EditItemPage() {
  const store = useStore();
  const { categoryId, itemId } = useParams<{ categoryId: string; itemId: string }>();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [item, setItem] = useState<Item | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = listenCategories(store.id, setCategories, (e) => setError(e.message));
    getItem(store.id, itemId)
      .then(setItem)
      .catch((e) => setError(e.message));
    return unsub;
  }, [store.id, itemId]);

  if (error) return <div className="p-4"><ErrorBox message={error} /></div>;
  if (!categories || item === undefined) return <PageSpinner />;
  if (!item) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-5">
        <EmptyState title={t.item.notFound} action={<Link href={`/dashboard/${store.id}/categories/${categoryId}`} className={buttonClass("secondary")}>{t.common.back}</Link>} />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5">
      <h1 className="mb-5 text-xl font-semibold text-gray-900">{t.item.editItem}</h1>
      <ItemForm store={store} categories={categories} itemId={item.id} item={item} defaultCategoryId={item.categoryId} defaultSectionId={item.sectionId} nextOrder={item.order} />
    </main>
  );
}
