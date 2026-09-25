"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Pencil, Plus, Trash2, ExternalLink } from "lucide-react";
import { useStore } from "@/components/admin/store-context";
import { SortableList } from "@/components/admin/sortable-list";
import { RowMenu } from "@/components/admin/row-menu";
import { CategoryDialog } from "@/components/admin/category-dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge, EmptyState, ErrorBox, PageTitle } from "@/components/ui/misc";
import { PageSpinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { deleteCategory, listenCategories, reorderCategories, setCategoryVisible } from "@/lib/firebase/categories";
import { listenItems } from "@/lib/firebase/items";
import { requestRevalidate } from "@/lib/firebase/revalidate";
import type { Category, Item } from "@/lib/schemas/types";
import { t } from "@/lib/i18n/en";

export default function CatalogPage() {
  const store = useStore();
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsubCats = listenCategories(store.id, setCategories, (e) => setError(e.message));
    const unsubItems = listenItems(store.id, setItems, (e) => setError(e.message));
    return () => {
      unsubCats();
      unsubItems();
    };
  }, [store.id]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((i) => map.set(i.categoryId, (map.get(i.categoryId) ?? 0) + 1));
    return map;
  }, [items]);

  async function onReorder(ids: string[]) {
    if (!categories) return;
    const byId = new Map(categories.map((c) => [c.id, c]));
    setCategories(ids.map((id) => byId.get(id)!));
    try {
      await reorderCategories(store.id, ids);
      void requestRevalidate(store.id);
    } catch {
      toast(t.common.somethingWrong, "error");
    }
  }

  async function toggleVisible(c: Category) {
    try {
      await setCategoryVisible(store.id, c.id, !c.visible);
      void requestRevalidate(store.id);
    } catch {
      toast(t.common.somethingWrong, "error");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteCategory(store.id, deleting, items.filter((i) => i.categoryId === deleting.id));
      void requestRevalidate(store.id);
      setDeleting(null);
    } catch {
      toast(t.common.somethingWrong, "error");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="p-4"><ErrorBox message={error} /></div>;
  if (!categories) return <PageSpinner />;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <PageTitle
        title={t.catalog.title}
        subtitle={store.name}
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> {t.catalog.addCategory}
          </Button>
        }
      />

      {categories.length === 0 ? (
        <EmptyState
          title={t.catalog.noCategories}
          hint={t.catalog.noCategoriesHint}
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> {t.catalog.addCategory}
            </Button>
          }
        />
      ) : (
        <SortableList
          items={categories}
          onReorder={onReorder}
          renderItem={(c, { handle, moveButtons }) => (
            <div className="flex items-center gap-1 rounded-2xl border border-gray-200 bg-white pr-1">
              {handle}
              <Link href={`/dashboard/${store.id}/categories/${c.id}`} className="flex min-h-14 flex-1 items-center gap-3 py-2">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-500">
                    {t.catalog.itemsCount(counts.get(c.id) ?? 0)}
                    {c.sections.length > 0 && ` · ${c.sections.length} ${t.catalog.sections.toLowerCase()}`}
                  </p>
                </div>
                {!c.visible && <Badge tone="amber">{t.common.hidden}</Badge>}
              </Link>
              {moveButtons}
              <RowMenu
                label={`${t.common.menu}: ${c.name}`}
                actions={[
                  { label: t.common.edit, icon: <Pencil className="h-4 w-4" />, onSelect: () => { setEditing(c); setDialogOpen(true); } },
                  {
                    label: c.visible ? t.common.hide : t.common.show,
                    icon: c.visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />,
                    onSelect: () => toggleVisible(c),
                  },
                  {
                    label: t.catalog.openPublic,
                    icon: <ExternalLink className="h-4 w-4" />,
                    onSelect: () => window.open(`/${store.slug}/${c.slug}`, "_blank", "noopener"),
                  },
                  { label: t.common.delete, icon: <Trash2 className="h-4 w-4" />, danger: true, onSelect: () => setDeleting(c) },
                ]}
              />
            </div>
          )}
        />
      )}

      <CategoryDialog open={dialogOpen} onClose={() => setDialogOpen(false)} storeId={store.id} category={editing} categories={categories} />
      <ConfirmDialog
        open={Boolean(deleting)}
        message={deleting ? t.catalog.deleteCategoryConfirm(deleting.name, counts.get(deleting.id) ?? 0) : ""}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
        loading={busy}
      />
    </main>
  );
}
