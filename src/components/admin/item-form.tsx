"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { PhotoManager } from "./photo-manager";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { createItem, ensureUniqueItemSlug, updateItem } from "@/lib/firebase/items";
import { deleteImageAssets, imagePaths } from "@/lib/firebase/storage";
import { requestRevalidate } from "@/lib/firebase/revalidate";
import { fieldErrors, itemFormSchema } from "@/lib/schemas";
import { DEFAULT_UNITS, type Category, type ImageAsset, type Item, type Spec, type Store } from "@/lib/schemas/types";
import { slugify } from "@/lib/slug";
import { t } from "@/lib/i18n/en";

type VariantDraft = { name: string; options: string };

type Props = {
  store: Store;
  categories: Category[];
  itemId: string;
  item: Item | null;
  defaultCategoryId: string;
  defaultSectionId: string | null;
  nextOrder: number;
};

export function ItemForm({ store, categories, itemId, item, defaultCategoryId, defaultSectionId, nextOrder }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(item?.name ?? "");
  const [code, setCode] = useState(item?.code ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [images, setImages] = useState<ImageAsset[]>(item?.images ?? []);
  const [specs, setSpecs] = useState<Spec[]>(item?.specs.length ? item.specs : [{ label: "", value: "" }]);
  const [variants, setVariants] = useState<VariantDraft[]>(
    item?.variants.length ? item.variants.map((v) => ({ name: v.name, options: v.options.join(", ") })) : [],
  );
  const initialUnit = item?.unit ?? DEFAULT_UNITS[0];
  const [unitChoice, setUnitChoice] = useState<string>((DEFAULT_UNITS as readonly string[]).includes(initialUnit) ? initialUnit : "custom");
  const [customUnit, setCustomUnit] = useState((DEFAULT_UNITS as readonly string[]).includes(initialUnit) ? "" : initialUnit);
  const [price, setPrice] = useState(item?.price != null ? String(item.price) : "");
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? defaultCategoryId);
  const [sectionId, setSectionId] = useState<string>(item?.sectionId ?? defaultSectionId ?? "");
  const [visible, setVisible] = useState(item?.visible ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const saved = useRef(false);
  const uploadedPaths = useRef(new Set<string>());

  // Existing items keep their slug (stable links); new ones derive it from code + name.
  const slug = item ? item.slug : slugify([code, name].filter(Boolean).join(" "));

  const category = categories.find((c) => c.id === categoryId);
  const basePath = imagePaths.item(store.id, itemId);
  const unit = unitChoice === "custom" ? customUnit.trim() : unitChoice;

  const values = useMemo(
    () => ({
      categoryId,
      sectionId: sectionId || null,
      name,
      slug: slug || slugify(name),
      code,
      description,
      images,
      specs: specs.filter((s) => s.label.trim() || s.value.trim()),
      variants: variants
        .map((v) => ({ name: v.name.trim(), options: v.options.split(",").map((o) => o.trim()).filter(Boolean) }))
        .filter((v) => v.name || v.options.length),
      price: price.trim() === "" ? null : Number(price),
      unit,
      visible,
    }),
    [categoryId, sectionId, name, slug, code, description, images, specs, variants, price, unit, visible],
  );

  // Track uploads made during this session so a cancelled new item leaves no orphan files.
  useEffect(() => {
    images.forEach((img) => {
      if (!item?.images.some((i) => i.path === img.path)) uploadedPaths.current.add(img.path);
    });
  }, [images, item]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = itemFormSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    if (Number.isNaN(parsed.data.price)) {
      setErrors({ price: t.common.required });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const uniqueSlug = await ensureUniqueItemSlug(store.id, parsed.data.slug, item?.id);
      const data = { ...parsed.data, slug: uniqueSlug };
      if (item) {
        await updateItem(store.id, itemId, data);
        const removed = item.images.filter((old) => !images.some((i) => i.path === old.path));
        await deleteImageAssets(removed).catch(() => {});
      } else {
        await createItem(store.id, itemId, data, nextOrder);
      }
      // Files uploaded but no longer in the list (removed before save).
      const stale = Array.from(uploadedPaths.current).filter((p) => !images.some((i) => i.path === p));
      await deleteImageAssets(stale.map((p) => ({ path: p, thumbPath: p.replace(/(\.[a-z]+)$/, "_thumb$1"), url: "", thumbUrl: "" }))).catch(() => {});
      saved.current = true;
      void requestRevalidate(store.id);
      toast(item ? t.item.saved : t.item.created);
      router.replace(`/dashboard/${store.id}/categories/${data.categoryId}`);
    } catch (err) {
      console.error(err);
      toast(t.common.somethingWrong, "error");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    // Clean up photos uploaded for a never-saved item (or added then abandoned).
    const orphans = images.filter((img) => uploadedPaths.current.has(img.path));
    if (orphans.length) await deleteImageAssets(orphans).catch(() => {});
    router.back();
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <Field label={t.item.name} error={errors.name}>
        {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} />}
      </Field>

      <Field label={t.item.code} hint={t.item.codeHint} error={errors.code} optional>
        {(id, describedBy) => <Input id={id} value={code} onChange={(e) => setCode(e.target.value)} aria-describedby={describedBy} />}
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t.item.category} error={errors.categoryId}>
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

      <div>
        <p className="mb-1 text-sm font-medium text-gray-800">{t.item.photos}</p>
        <p className="mb-2 text-xs text-gray-500">{t.item.photosHint}</p>
        <PhotoManager basePath={basePath} images={images} onChange={setImages} onUploadingChange={setUploading} />
      </div>

      <Field label={t.item.description} error={errors.description} optional>
        {(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={3000} rows={5} />}
      </Field>

      {/* Specs */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-800">{t.item.specs}</legend>
        <p className="mb-2 text-xs text-gray-500">{t.item.specsHint}</p>
        <div className="space-y-2">
          {specs.map((s, i) => (
            <div key={i} className="flex items-start gap-2">
              <Input
                aria-label={`${t.item.specLabel} ${i + 1}`}
                placeholder={t.item.specLabel}
                value={s.label}
                onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                maxLength={80}
              />
              <Input
                aria-label={`${t.item.specValue} ${i + 1}`}
                placeholder={t.item.specValue}
                value={s.value}
                onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                maxLength={300}
              />
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100"
                onClick={() => setSpecs(specs.filter((_, j) => j !== i))}
                aria-label={`${t.common.remove} ${t.item.specLabel} ${i + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setSpecs([...specs, { label: "", value: "" }])} disabled={specs.length >= 40}>
          <Plus className="h-4 w-4" /> {t.item.addSpec}
        </Button>
      </fieldset>

      {/* Variants */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-800">{t.item.variants}</legend>
        <p className="mb-2 text-xs text-gray-500">{t.item.variantsHint}</p>
        <div className="space-y-3">
          {variants.map((v, i) => (
            <div key={i} className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <Input
                    aria-label={`${t.item.variantName} ${i + 1}`}
                    placeholder={t.item.variantName}
                    value={v.name}
                    onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    maxLength={60}
                  />
                  <Input
                    aria-label={`${t.item.variantOptions} ${i + 1}`}
                    placeholder={t.item.variantOptions}
                    value={v.options}
                    onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, options: e.target.value } : x)))}
                  />
                </div>
                <button
                  type="button"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100"
                  onClick={() => setVariants(variants.filter((_, j) => j !== i))}
                  aria-label={`${t.common.remove} ${t.item.variantName} ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        {errors.variants && <p className="mt-1 text-xs text-red-600">{errors.variants}</p>}
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setVariants([...variants, { name: "", options: "" }])} disabled={variants.length >= 10}>
          <Plus className="h-4 w-4" /> {t.item.addVariant}
        </Button>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t.item.unit} error={errors.unit}>
          {(id) => (
            <div className="flex gap-2">
              <Select id={id} value={unitChoice} onChange={(e) => setUnitChoice(e.target.value)} className="max-w-[9rem]">
                {DEFAULT_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {t.item.units[u]}
                  </option>
                ))}
                <option value="custom">{t.item.units.custom}</option>
              </Select>
              {unitChoice === "custom" && (
                <Input aria-label={t.item.unitCustom} placeholder={t.item.unitCustom} value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} maxLength={20} invalid={!!errors.unit} />
              )}
            </div>
          )}
        </Field>
        <Field label={`${t.item.price} (${store.currency})`} hint={t.item.priceHint(store.showPrices)} error={errors.price} optional>
          {(id, describedBy) => (
            <Input id={id} type="number" inputMode="decimal" min={0} step="any" value={price} onChange={(e) => setPrice(e.target.value)} aria-describedby={describedBy} invalid={!!errors.price} />
          )}
        </Field>
      </div>

      <Switch checked={visible} onChange={setVisible} label={t.item.visible} />

      <div className="sticky bottom-16 z-10 flex gap-2 border-t border-gray-200 bg-white/95 py-3 backdrop-blur md:bottom-0">
        <Button variant="secondary" onClick={cancel} disabled={busy} className="flex-1">
          {t.common.cancel}
        </Button>
        <Button type="submit" loading={busy} disabled={uploading} className="flex-1">
          {t.common.save}
        </Button>
      </div>
    </form>
  );
}
