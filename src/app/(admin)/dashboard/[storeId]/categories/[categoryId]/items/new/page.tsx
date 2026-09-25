"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useStore } from "@/components/admin/store-context";
import { ItemForm } from "@/components/admin/item-form";
import { PageSpinner } from "@/components/ui/spinner";
import { ErrorBox } from "@/components/ui/misc";
import { listenCategories } from "@/lib/firebase/categories";
import { listenItemsInCategory, newItemId } from "@/lib/firebase/items";
import type { Category, Item } from "@/lib/schemas/types";
import { t } from "@/lib/i18n/en";

export default function NewItemPage() {
  const store = useStore();
  const { categoryId } = useParams<{ categoryId: string }>();
  const search = useSearchParams();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemId] = useState(() => newItemId(store.id));

  useEffect(() => {
    const u1 = listenCategories(store.id, setCategories, (e) => setError(e.message));
    const u2 = listenItemsInCategory(store.id, categoryId, setItems, (e) => setError(e.message));
    return () => {
      u1();
      u2();
    };
  }, [store.id, categoryId]);

  if (error) return <div className="p-4"><ErrorBox message={error} /></div>;
  if (!categories || !items) return <PageSpinner />;

  const nextOrder = items.length ? Math.max(...items.map((i) => i.order)) + 1 : 0;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5">
      <h1 className="mb-5 text-xl font-semibold text-gray-900">{t.item.newItem}</h1>
      <ItemForm
        store={store}
        categories={categories}
        itemId={itemId}
        item={null}
        defaultCategoryId={categoryId}
        defaultSectionId={search.get("section")}
        nextOrder={nextOrder}
      />
    </main>
  );
}
