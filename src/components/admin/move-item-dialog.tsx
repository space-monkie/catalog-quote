"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import type { Category, Item } from "@/lib/schemas/types";
import { t } from "@/lib/i18n/en";

type Props = {
  open: boolean;
  onClose: () => void;
  item: Item | null;
  categories: Category[];
  onMove: (categoryId: string, sectionId: string | null) => Promise<void>;
};

export function MoveItemDialog(props: Props) {
  // The body is remounted on every open so its state starts from the item.
  return props.open && props.item ? <MoveItemDialogBody {...props} item={props.item} /> : null;
}

function MoveItemDialogBody({ open, onClose, item, categories, onMove }: Props & { item: Item }) {
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [sectionId, setSectionId] = useState(item.sectionId ?? "");
  const [busy, setBusy] = useState(false);
  const category = categories.find((c) => c.id === categoryId);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.catalog.moveItem}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t.common.cancel}
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onMove(categoryId, sectionId || null);
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {t.common.move}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t.item.category}>
          {(id) => (
            <Select
              id={id}
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setSectionId("");
              }}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t.item.section}>
          {(id) => (
            <Select id={id} value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">{t.item.noSection}</option>
              {category?.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Dialog>
  );
}
