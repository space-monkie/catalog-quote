"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAuth } from "./auth-provider";
import { ImageInput } from "./image-input";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { createStore, isSlugAvailable, updateStore } from "@/lib/firebase/stores";
import { deleteImageAsset, imagePaths, uploadImageAsset } from "@/lib/firebase/storage";
import { requestRevalidate } from "@/lib/firebase/revalidate";
import { fieldErrors, storeFormSchema, type StoreForm as StoreFormValues } from "@/lib/schemas";
import { DEFAULT_BRAND_COLOR, DEFAULT_CURRENCY, type ImageAsset, type Store } from "@/lib/schemas/types";
import { isReservedSlug, slugify } from "@/lib/slug";
import { normalizeHex } from "@/lib/color";
import { t } from "@/lib/i18n/en";
import { firebaseClient } from "@/lib/firebase/client";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";

const CURRENCIES = [
  "INR", "USD", "EUR", "GBP", "AED", "SAR", "QAR", "OMR", "KWD", "BHD", "KES", "NGN", "GHS", "TZS", "UGX", "ETB",
  "ZAR", "EGP", "MAD", "MYR", "SGD", "IDR", "THB", "VND", "PHP", "BDT", "LKR", "NPR", "PKR", "AUD", "CAD", "JPY", "CNY",
];

function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return letters.slice(0, 4) || "Q";
}

function normalizePhone(value: string): string {
  const digits = value.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? `+${digits.slice(1).replace(/\+/g, "")}` : digits ? `+${digits}` : "";
}

type Props = { mode: "create"; onSaved: (storeId: string) => void } | { mode: "edit"; store: Store; onSaved?: (storeId: string) => void };

export function StoreForm(props: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const existing = props.mode === "edit" ? props.store : null;

  const [name, setName] = useState(existing?.name ?? "");
  const [slugInput, setSlugInput] = useState(existing?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(existing));
  const [prefixInput, setPrefixInput] = useState(existing?.quotePrefix ?? "");
  const [prefixTouched, setPrefixTouched] = useState(Boolean(existing));
  // Auto-generated from the name until the owner edits them.
  const slug = slugTouched ? slugInput : slugify(name);
  const prefix = prefixTouched ? prefixInput : initials(name);
  const [about, setAbout] = useState(existing?.about ?? "");
  const [brandColor, setBrandColor] = useState(existing?.brandColor ?? DEFAULT_BRAND_COLOR);
  const [whatsapp, setWhatsapp] = useState(existing?.whatsappNumber ?? "");
  const [showPrices, setShowPrices] = useState(existing?.showPrices ?? false);
  const [currency, setCurrency] = useState(existing?.currency ?? DEFAULT_CURRENCY);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<{ slug: string; available: boolean | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const checkSeq = useRef(0);

  // Slug status: decided synchronously where possible, otherwise from the last async check.
  const needsCheck = slug.length >= 3 && !isReservedSlug(slug) && !(existing && slug === existing.slug);
  const slugState: "idle" | "checking" | "ok" | "taken" | "reserved" =
    !slug || slug.length < 3
      ? "idle"
      : isReservedSlug(slug)
        ? "reserved"
        : existing && slug === existing.slug
          ? "ok"
          : checked?.slug === slug
            ? checked.available === null
              ? "idle"
              : checked.available
                ? "ok"
                : "taken"
            : "checking";

  // Debounced availability check against the slug registry.
  useEffect(() => {
    if (!needsCheck) return;
    const seq = ++checkSeq.current;
    const current = slug;
    const handle = setTimeout(async () => {
      try {
        const ok = await isSlugAvailable(current, existing?.id);
        if (seq === checkSeq.current) setChecked({ slug: current, available: ok });
      } catch {
        if (seq === checkSeq.current) setChecked({ slug: current, available: null });
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [slug, needsCheck, existing]);

  const values = useMemo<StoreFormValues>(
    () => ({
      name,
      slug,
      logo: existing?.logo ?? null,
      about,
      brandColor: normalizeHex(brandColor),
      whatsappNumber: normalizePhone(whatsapp),
      quotePrefix: prefix.toUpperCase(),
      showPrices,
      currency,
    }),
    [name, slug, existing, about, brandColor, whatsapp, prefix, showPrices, currency],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    const parsed = storeFormSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    if (slugState === "taken" || slugState === "reserved") {
      setErrors({ slug: slugState === "taken" ? t.store.slugTaken : t.store.slugReserved });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (props.mode === "create") {
        const storeId = await createStore(user.uid, { ...parsed.data, logo: null });
        if (logoFile) {
          const logo = await uploadImageAsset(imagePaths.logo(storeId), logoFile);
          const { db } = firebaseClient();
          await updateDoc(doc(db, "stores", storeId), { logo, updatedAt: serverTimestamp() });
        }
        void requestRevalidate(storeId);
        toast(t.store.created);
        props.onSaved(storeId);
      } else {
        const store = props.store;
        let logo: ImageAsset | null = store.logo;
        if (logoFile) {
          logo = await uploadImageAsset(imagePaths.logo(store.id), logoFile);
        } else if (logoRemoved) {
          logo = null;
        }
        await updateStore(store, { ...parsed.data, logo });
        if ((logoFile || logoRemoved) && store.logo) await deleteImageAsset(store.logo).catch(() => {});
        void requestRevalidate(store.id, parsed.data.slug !== store.slug ? store.slug : undefined);
        toast(t.store.updated);
        setLogoFile(null);
        setLogoRemoved(false);
        props.onSaved?.(store.id);
      }
    } catch (err) {
      console.error(err);
      const code = (err as { code?: string })?.code ?? "";
      if (code === "permission-denied" || code === "firestore/permission-denied") {
        setErrors({ slug: t.store.slugTaken });
        setChecked({ slug, available: false });
      } else {
        toast(t.common.somethingWrong, "error");
      }
    } finally {
      setBusy(false);
    }
  }

  const slugHint =
    slugState === "checking"
      ? t.store.slugChecking
      : slugState === "ok"
        ? t.store.slugAvailable
        : slugState === "taken"
          ? t.store.slugTaken
          : slugState === "reserved"
            ? t.store.slugReserved
            : t.store.slugHint;

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Field label={t.store.name} error={errors.name}>
        {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} autoComplete="organization" />}
      </Field>

      <Field label={t.store.slug} hint={slugHint} error={errors.slug}>
        {(id, describedBy) => (
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-gray-500 sm:inline">{(process.env.NEXT_PUBLIC_SITE_URL || "").replace(/^https?:\/\//, "")}/</span>
            <Input
              id={id}
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
              }}
              onBlur={() => setSlugInput(slugify(slug))}
              aria-describedby={describedBy}
              invalid={!!errors.slug || slugState === "taken" || slugState === "reserved"}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        )}
      </Field>

      <ImageInput
        label={existing?.logo && !logoRemoved ? t.store.changeLogo : t.store.uploadLogo}
        value={existing?.logo ?? null}
        pendingFile={logoFile}
        removed={logoRemoved}
        onChange={(file) => {
          setLogoFile(file);
          setLogoRemoved(file === null);
        }}
      />

      <Field label={t.store.brandColor} error={errors.brandColor}>
        {(id) => (
          <div className="flex items-center gap-3">
            <input
              type="color"
              aria-label={t.store.brandColor}
              className="h-11 w-14 cursor-pointer rounded-lg border border-gray-300 bg-white p-1"
              value={normalizeHex(brandColor)}
              onChange={(e) => setBrandColor(e.target.value)}
            />
            <Input id={id} value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="max-w-[10rem]" invalid={!!errors.brandColor} />
          </div>
        )}
      </Field>

      <Field label={t.store.whatsappNumber} hint={t.store.whatsappHint} error={errors.whatsappNumber}>
        {(id, describedBy) => (
          <Input
            id={id}
            type="tel"
            inputMode="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            onBlur={() => setWhatsapp((v) => normalizePhone(v))}
            placeholder="+91 98765 43210"
            aria-describedby={describedBy}
            invalid={!!errors.whatsappNumber}
          />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label={t.store.quotePrefix} hint={t.store.quotePrefixHint} error={errors.quotePrefix}>
          {(id, describedBy) => (
            <Input
              id={id}
              value={prefix}
              onChange={(e) => {
                setPrefixTouched(true);
                setPrefixInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8));
              }}
              aria-describedby={describedBy}
              invalid={!!errors.quotePrefix}
              autoCapitalize="characters"
            />
          )}
        </Field>
        <Field label={t.store.currency} error={errors.currency}>
          {(id) => (
            <Select id={id} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <Switch checked={showPrices} onChange={setShowPrices} label={t.store.showPrices} hint={t.store.showPricesHint} />

      <Field label={t.store.about} hint={t.store.aboutHint} error={errors.about} optional>
        {(id, describedBy) => <Textarea id={id} value={about} onChange={(e) => setAbout(e.target.value)} maxLength={600} aria-describedby={describedBy} />}
      </Field>

      <Button type="submit" size="lg" full loading={busy}>
        {props.mode === "create" ? t.dashboard.createStore : t.common.save}
      </Button>
    </form>
  );
}
