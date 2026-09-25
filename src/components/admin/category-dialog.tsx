"use client";

import { useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Switch, Textarea } from "@/components/ui/field";
import { ImageInput } from "./image-input";
import { useToast } from "@/components/ui/toast";
import { createCategory, updateCategory } from "@/lib/firebase/categories";
import { deleteImageAsset, imagePaths, uploadImageAsset } from "@/lib/firebase/storage";
import { requestRevalidate } from "@/lib/firebase/revalidate";
import { categoryFormSchema, fieldErrors } from "@/lib/schemas";
import type { Category, ImageAsset } from "@/lib/schemas/types";
import { slugify, uniqueSlug } from "@/lib/slug";
import { t } from "@/lib/i18n/en";
import { firebaseClient } from "@/lib/firebase/client";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";

type Props = {
  open: boolean;
  onClose: () => void;
  storeId: string;
  category: Category | null;
  /** Existing categories, for slug uniqueness and ordering. */
  categories: Category[];
  onSaved?: (id: string) => void;
};

export function CategoryDialog(props: Props) {
  // The body is remounted on every open so its state starts from the category.
  return props.open ? <CategoryDialogBody {...props} /> : null;
}

function CategoryDialogBody({ open, onClose, storeId, category, categories, onSaved }: Props) {
  const { toast } = useToast();
  const [name, setName] = useState(category?.name ?? "");
  const [slugInput, setSlugInput] = useState(category?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(category));
  const [description, setDescription] = useState(category?.description ?? "");
  const [visible, setVisible] = useState(category?.visible ?? true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Auto-generated from the name until the owner edits it.
  const slug = slugTouched ? slugInput : slugify(name);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const taken = categories.filter((c) => c.id !== category?.id).map((c) => c.slug);
    const finalSlug = uniqueSlug(slugify(slug) || slugify(name), taken);
    const parsed = categoryFormSchema.safeParse({
      name,
      slug: finalSlug,
      description,
      image: category?.image ?? null,
      visible,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      let id = category?.id;
      let image: ImageAsset | null = category?.image ?? null;
      if (!id) {
        const order = categories.length ? Math.max(...categories.map((c) => c.order)) + 1 : 0;
        id = await createCategory(storeId, { ...parsed.data, image: null }, order);
      }
      if (imageFile) {
        image = await uploadImageAsset(imagePaths.category(storeId, id), imageFile);
      } else if (imageRemoved) {
        image = null;
      }
      if (category) {
        await updateCategory(storeId, id, { ...parsed.data, image });
      } else if (image) {
        const { db } = firebaseClient();
        await updateDoc(doc(db, "stores", storeId, "categories", id), { image, updatedAt: serverTimestamp() });
      }
      if ((imageFile || imageRemoved) && category?.image) await deleteImageAsset(category.image).catch(() => {});
      void requestRevalidate(storeId);
      toast(t.common.saved);
      onSaved?.(id);
      onClose();
    } catch (err) {
      console.error(err);
      toast(t.common.somethingWrong, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={category ? t.catalog.editCategory : t.catalog.newCategory}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t.common.cancel}
          </Button>
          <Button type="submit" form="category-form" loading={busy}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label={t.catalog.categoryName} error={errors.name}>
          {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} autoFocus />}
        </Field>
        <Field label={t.catalog.categorySlug} error={errors.slug} hint={t.store.slugHint}>
          {(id, describedBy) => (
            <Input
              id={id}
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlugInput(e.target.value.toLowerCase());
              }}
              onBlur={() => setSlugInput(slugify(slug))}
              aria-describedby={describedBy}
              invalid={!!errors.slug}
              autoCapitalize="none"
              spellCheck={false}
            />
          )}
        </Field>
        <Field label={t.catalog.categoryDescription} optional error={errors.description}>
          {(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />}
        </Field>
        <ImageInput
          label={t.catalog.categoryImage}
          value={category?.image ?? null}
          pendingFile={imageFile}
          removed={imageRemoved}
          shape="wide"
          onChange={(file) => {
            setImageFile(file);
            setImageRemoved(file === null);
          }}
        />
        <Switch checked={visible} onChange={setVisible} label={t.item.visible} />
      </form>
    </Dialog>
  );
}
