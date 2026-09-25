"use client";

import { useState } from "react";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { SortableList } from "./sortable-list";
import { RowMenu } from "./row-menu";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { newSection } from "@/lib/firebase/categories";
import type { Section } from "@/lib/schemas/types";
import { t } from "@/lib/i18n/en";

type Props = {
  sections: Section[];
  itemCounts: Map<string, number>;
  onSave: (sections: Section[]) => Promise<void>;
};

export function SectionManager({ sections, itemCounts, onSave }: Props) {
  const [editing, setEditing] = useState<Section | "new" | null>(null);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<Section | null>(null);
  const [busy, setBusy] = useState(false);

  async function commit(next: Section[]) {
    setBusy(true);
    try {
      await onSave(next.map((s, i) => ({ ...s, order: i })));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t.catalog.sections}</h2>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setName("");
            setEditing("new");
          }}
        >
          <Plus className="h-4 w-4" /> {t.catalog.addSection}
        </Button>
      </div>

      {sections.length === 0 ? (
        <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">{t.catalog.noSections}</p>
      ) : (
        <SortableList
          items={sections}
          disabled={busy}
          onReorder={(ids) => {
            const byId = new Map(sections.map((s) => [s.id, s]));
            void commit(ids.map((id) => byId.get(id)!));
          }}
          renderItem={(s, { handle, moveButtons }) => (
            <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white pr-1">
              {handle}
              <div className="min-w-0 flex-1 py-2">
                <p className="truncate text-sm font-medium text-gray-900">{s.name}</p>
                <p className="text-xs text-gray-500">{t.catalog.itemsCount(itemCounts.get(s.id) ?? 0)}</p>
              </div>
              {!s.visible && <Badge tone="amber">{t.common.hidden}</Badge>}
              {moveButtons}
              <RowMenu
                label={`${t.common.menu}: ${s.name}`}
                actions={[
                  { label: t.catalog.renameSection, icon: <Pencil className="h-4 w-4" />, onSelect: () => { setName(s.name); setEditing(s); } },
                  {
                    label: s.visible ? t.common.hide : t.common.show,
                    icon: s.visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />,
                    onSelect: () => void commit(sections.map((x) => (x.id === s.id ? { ...x, visible: !x.visible } : x))),
                  },
                  { label: t.common.delete, icon: <Trash2 className="h-4 w-4" />, danger: true, onSelect: () => setDeleting(s) },
                ]}
              />
            </div>
          )}
        />
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? t.catalog.addSection : t.catalog.renameSection}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" form="section-form" loading={busy}>
              {t.common.save}
            </Button>
          </>
        }
      >
        <form
          id="section-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            if (editing === "new") await commit([...sections, newSection(trimmed, sections.length)]);
            else if (editing) await commit(sections.map((s) => (s.id === editing.id ? { ...s, name: trimmed } : s)));
            setEditing(null);
          }}
        >
          <Field label={t.catalog.sectionName}>
            {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus required />}
          </Field>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        message={deleting ? t.catalog.deleteSectionConfirm(deleting.name, itemCounts.get(deleting.id) ?? 0) : ""}
        loading={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await commit(sections.filter((s) => s.id !== deleting.id));
          setDeleting(null);
        }}
      />
    </section>
  );
}
