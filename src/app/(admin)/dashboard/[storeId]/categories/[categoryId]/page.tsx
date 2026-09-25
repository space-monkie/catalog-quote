"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Copy, ExternalLink, Eye, EyeOff, FolderInput, Pencil, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/components/admin/store-context";
import { SortableList } from "@/components/admin/sortable-list";
import { RowMenu } from "@/components/admin/row-menu";
import { CategoryDialog } from "@/components/admin/category-dialog";
import { SectionManager } from "@/components/admin/section-manager";
import { MoveItemDialog } from "@/components/admin/move-item-dialog";
import { buttonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge, EmptyState, ErrorBox } from "@/components/ui/misc";
import { PageSpinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { deleteCategory, listenCategories, saveSections, setCategoryVisible } from "@/lib/firebase/categories";
import { deleteItem, duplicateItem, listenItemsInCategory, moveItem, reorderItems, setItemVisible } from "@/lib/firebase/items";
import { requestRevalidate } from "@/lib/firebase/revalidate";
import type { Category, Item, Section } from "@/lib/schemas/types";
import { t } from "@/lib/i18n/en";

export default function CategoryEditorPage() {
  const store = useStore();
  const router = useRouter();
  const { toast } = useToast();
  const { categoryId } = useParams<{ categoryId: string }>();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState(false);
  const [deletingItem, setDeletingItem] = useState<Item | null>(null);
  const [movingItem, setMovingItem] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const u1 = listenCategories(store.id, setCategories, (e) => setError(e.message));
    const u2 = listenItemsInCategory(store.id, categoryId, setItems, (e) => setError(e.message));
    return () => {
      u1();
      u2();
    };
  }, [store.id, categoryId]);

  const category = categories?.find((c) => c.id === categoryId) ?? null;

  const groups = useMemo(() => {
    if (!category || !items) return [];
    const bySection = new Map<string | null, Item[]>();
    items.forEach((i) => {
      const key = i.sectionId && category.sections.some((s) => s.id === i.sectionId) ? i.sectionId : null;
      bySection.set(key, [...(bySection.get(key) ?? []), i]);
    });
    const list: { section: Section | null; items: Item[] }[] = category.sections.map((s) => ({ section: s, items: bySection.get(s.id) ?? [] }));
    const loose = bySection.get(null) ?? [];
    if (loose.length || category.sections.length === 0) list.push({ section: null, items: loose });
    return list;
  }, [category, items]);

  const sectionCounts = useMemo(() => {
    const m = new Map<string, number>();
    items?.forEach((i) => i.sectionId && m.set(i.sectionId, (m.get(i.sectionId) ?? 0) + 1));
    return m;
  }, [items]);

  /** Re-numbers every item in the category in display order (sections, then position). */
  async function persistOrder(next: { section: Section | null; items: Item[] }[]) {
    const ids = next.flatMap((g) => g.items.map((i) => i.id));
    setItems(next.flatMap((g) => g.items).map((i, index) => ({ ...i, order: index })));
    try {
      await reorderItems(store.id, ids);
      void requestRevalidate(store.id);
    } catch {
      toast(t.common.somethingWrong, "error");
    }
  }

  function reorderWithin(sectionId: string | null, ids: string[]) {
    const next = groups.map((g) => {
      if ((g.section?.id ?? null) !== sectionId) return g;
      const byId = new Map(g.items.map((i) => [i.id, i]));
      return { ...g, items: ids.map((id) => byId.get(id)!) };
    });
    void persistOrder(next);
  }

  async function run(action: () => Promise<void>, success?: string) {
    setBusy(true);
    try {
      await action();
      void requestRevalidate(store.id);
      if (success) toast(success);
    } catch (err) {
      console.error(err);
      toast(t.common.somethingWrong, "error");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="p-4"><ErrorBox message={error} /></div>;
  if (!categories || !items) return <PageSpinner />;
  if (!category) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-5">
        <EmptyState title={t.dashboard.storeNotFound} action={<Link href={`/dashboard/${store.id}`} className={buttonClass("secondary")}>{t.common.back}</Link>} />
      </main>
    );
  }

  const base = `/dashboard/${store.id}/categories/${category.id}`;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <Link href={`/dashboard/${store.id}`} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-gray-600">
        <ArrowLeft className="h-4 w-4" /> {t.catalog.categories}
      </Link>

      <div className="mb-5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-gray-900">{category.name}</h1>
          <p className="text-sm text-gray-500">{t.catalog.itemsCount(items.length)}</p>
          {!category.visible && <p className="mt-1 text-xs text-amber-700">{t.catalog.categoryHidden}</p>}
        </div>
        <RowMenu
          label={`${t.common.menu}: ${category.name}`}
          actions={[
            { label: t.catalog.editCategory, icon: <Pencil className="h-4 w-4" />, onSelect: () => setEditOpen(true) },
            {
              label: category.visible ? t.common.hide : t.common.show,
              icon: category.visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />,
              onSelect: () => run(() => setCategoryVisible(store.id, category.id, !category.visible)),
            },
            { label: t.catalog.openPublic, icon: <ExternalLink className="h-4 w-4" />, onSelect: () => window.open(`/${store.slug}/${category.slug}`, "_blank", "noopener") },
            { label: t.catalog.deleteCategory, icon: <Trash2 className="h-4 w-4" />, danger: true, onSelect: () => setDeletingCategory(true) },
          ]}
        />
      </div>

      <SectionManager
        sections={category.sections}
        itemCounts={sectionCounts}
        onSave={(sections) => run(() => saveSections(store.id, category.id, sections))}
      />

      <div className="mt-8 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t.catalog.items}</h2>
          <Link href={`${base}/items/new`} className={buttonClass("primary", "sm")}>
            <Plus className="h-4 w-4" /> {t.catalog.addItem}
          </Link>
        </div>

        {items.length === 0 && (
          <EmptyState title={t.catalog.noItems} hint={t.catalog.noItemsHint} action={<Link href={`${base}/items/new`} className={buttonClass("primary")}>{t.catalog.addItem}</Link>} />
        )}

        {groups.map((g) => (
          <section key={g.section?.id ?? "none"} aria-label={g.section?.name ?? t.catalog.unsectioned}>
            {(category.sections.length > 0 || items.length > 0) && (
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">
                  {g.section?.name ?? t.catalog.unsectioned}
                  {g.section && !g.section.visible && <Badge tone="amber">{t.common.hidden}</Badge>}
                </h3>
                <Link href={`${base}/items/new${g.section ? `?section=${g.section.id}` : ""}`} className="min-h-11 inline-flex items-center gap-1 text-sm text-[var(--brand)]">
                  <Plus className="h-4 w-4" /> {t.common.add}
                </Link>
              </div>
            )}
            {g.items.length === 0 ? (
              items.length > 0 && <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">{t.catalog.noSectionItems}</p>
            ) : (
              <SortableList
                items={g.items}
                disabled={busy}
                onReorder={(ids) => reorderWithin(g.section?.id ?? null, ids)}
                renderItem={(item, { handle, moveButtons }) => (
                  <div className="flex items-center gap-1 rounded-2xl border border-gray-200 bg-white pr-1">
                    {handle}
                    <Link href={`${base}/items/${item.id}`} className="flex min-h-14 flex-1 items-center gap-3 py-2">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                        {item.images[0] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.images[0].thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-gray-900">{item.name}</p>
                        {item.code && <p className="truncate text-xs text-gray-500">{item.code}</p>}
                      </div>
                      {!item.visible && <Badge tone="amber">{t.common.hidden}</Badge>}
                    </Link>
                    {moveButtons}
                    <RowMenu
                      label={`${t.common.menu}: ${item.name}`}
                      actions={[
                        { label: t.common.edit, icon: <Pencil className="h-4 w-4" />, onSelect: () => router.push(`${base}/items/${item.id}`) },
                        { label: t.common.duplicate, icon: <Copy className="h-4 w-4" />, onSelect: () => run(() => duplicateItem(store.id, item, t.catalog.duplicateSuffix).then(() => {}), t.catalog.duplicated) },
                        { label: t.common.move, icon: <FolderInput className="h-4 w-4" />, onSelect: () => setMovingItem(item) },
                        {
                          label: item.visible ? t.common.hide : t.common.show,
                          icon: item.visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />,
                          onSelect: () => run(() => setItemVisible(store.id, item.id, !item.visible)),
                        },
                        { label: t.common.delete, icon: <Trash2 className="h-4 w-4" />, danger: true, onSelect: () => setDeletingItem(item) },
                      ]}
                    />
                  </div>
                )}
              />
            )}
          </section>
        ))}
      </div>

      <CategoryDialog open={editOpen} onClose={() => setEditOpen(false)} storeId={store.id} category={category} categories={categories} />

      <MoveItemDialog
        open={Boolean(movingItem)}
        onClose={() => setMovingItem(null)}
        item={movingItem}
        categories={categories}
        onMove={async (targetCategoryId, sectionId) => {
          if (!movingItem) return;
          const order = Date.now();
          await run(() => moveItem(store.id, movingItem.id, { categoryId: targetCategoryId, sectionId, order }), t.catalog.moved);
        }}
      />

      <ConfirmDialog
        open={Boolean(deletingItem)}
        message={deletingItem ? t.catalog.deleteItemConfirm(deletingItem.name) : ""}
        loading={busy}
        onCancel={() => setDeletingItem(null)}
        onConfirm={async () => {
          if (!deletingItem) return;
          await run(() => deleteItem(store.id, deletingItem));
          setDeletingItem(null);
        }}
      />

      <ConfirmDialog
        open={deletingCategory}
        message={t.catalog.deleteCategoryConfirm(category.name, items.length)}
        loading={busy}
        onCancel={() => setDeletingCategory(false)}
        onConfirm={async () => {
          await run(() => deleteCategory(store.id, category, items));
          router.replace(`/dashboard/${store.id}`);
        }}
      />
    </main>
  );
}
