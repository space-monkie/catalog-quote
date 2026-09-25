"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, Trash2 } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/dialog";
import { QuantityStepper } from "./quantity-stepper";
import { VariantPicker } from "./variant-picker";
import { CountryPicker } from "./country-picker";
import { BUYER_KEY, EMPTY_BUYER, lastQuoteKey, useQuoteList, type BuyerMemory, type LastQuote } from "@/lib/quote-list";
import { useStoredValue } from "@/lib/local-storage";
import type { PublicStore } from "@/lib/schemas/types";
import { t } from "@/lib/i18n/en";

type ApiSuccess = { quoteId: string; quoteNumber: string; whatsappUrl: string; quoteUrl: string };
type ApiError = { error: string; missing?: string[]; message?: string };

export function QuotePage({ store }: { store: PublicStore }) {
  const list = useQuoteList();
  // Name and country are remembered for the next quote.
  const [buyer, setBuyer] = useStoredValue<BuyerMemory>(BUYER_KEY, EMPTY_BUYER);
  const [sent, setSent] = useStoredValue<LastQuote | null>(lastQuoteKey(store.slug), null);
  const name = buyer.name;
  const country = buyer.country;
  const setName = (v: string) => setBuyer((prev) => ({ ...prev, name: v }));
  const setCountry = (v: string) => setBuyer((prev) => ({ ...prev, country: v }));
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = t.quote.errors.name;
    if (!country.trim()) nextErrors.country = t.quote.errors.country;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setFormError(null);
    setSending(true);
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storeSlug: store.slug,
          buyer: { name: name.trim(), country: country.trim(), note: note.trim() },
          items: list.entries.map((e) => ({ itemId: e.itemId, selectedOptions: e.selectedOptions, qty: e.qty })),
          website,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ApiError;
        if (res.status === 422 && body.missing?.length) {
          list.removeMany(list.entries.filter((e) => body.missing!.includes(e.itemId)).map((e) => e.key));
          setFormError(t.quote.errors.itemsMissing);
        } else if (res.status === 429) {
          setFormError(t.quote.errors.rateLimited);
        } else {
          setFormError(t.quote.errors.generic);
        }
        return;
      }
      const data = (await res.json()) as ApiSuccess;
      setBuyer({ name: name.trim(), country: country.trim() });
      const last: LastQuote = { ...data, at: Date.now() };
      list.clear();
      setSent(last);
      // location.href (not window.open) so mobile browsers don't block the hand-off.
      window.location.href = data.whatsappUrl;
    } catch {
      setFormError(t.quote.errors.generic);
    } finally {
      setSending(false);
    }
  }

  if (!list.hydrated) return null;

  // Confirmation state: shown after sending, and again when the buyer comes back.
  if (list.entries.length === 0 && sent) {
    return (
      <div className="mx-auto max-w-md py-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand-soft-text)]">
          <Check className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-gray-900">{t.quote.sentTitle}</h1>
        <p className="mt-2 text-sm text-gray-600">{t.quote.sentBody(sent.quoteNumber)}</p>
        <div className="mt-6 flex flex-col gap-2">
          <Button
            size="lg"
            onClick={() => {
              window.location.href = sent.whatsappUrl;
            }}
          >
            {t.quote.openWhatsAppAgain}
          </Button>
          <a href={sent.quoteUrl} className={buttonClass("secondary", "lg")}>
            {t.quote.viewSent}
          </a>
          <Link
            href={`/${store.slug}`}
            className={buttonClass("ghost", "lg")}
            onClick={() => setSent(null)}
          >
            {t.quote.newQuote}
          </Link>
        </div>
      </div>
    );
  }

  if (list.entries.length === 0) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <h1 className="text-2xl font-semibold text-gray-900">{t.quote.empty}</h1>
        <p className="mt-2 text-sm text-gray-600">{t.quote.emptyHint}</p>
        <Link href={`/${store.slug}`} className={buttonClass("primary", "lg", "mt-6")}>
          {t.quote.browse}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">{t.quote.title}</h1>
        <button type="button" onClick={() => setConfirmClear(true)} className="min-h-11 text-sm text-gray-500 underline">
          {t.quote.clearAll}
        </button>
      </div>
      <p className="text-sm text-gray-500">{t.quote.items(list.entries.length)}</p>

      <ul className="mt-4 space-y-3">
        {list.entries.map((entry) => (
          <li key={entry.key} className="rounded-2xl border border-gray-200 bg-white p-3">
            <div className="flex gap-3">
              <Link href={`/${store.slug}/${entry.categorySlug}/${entry.itemSlug}`} className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                {entry.thumbUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900">{entry.name}</p>
                {entry.code && <p className="text-xs text-gray-500">{entry.code}</p>}
              </div>
              <button type="button" onClick={() => list.remove(entry.key)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label={`${t.quote.removeItem} ${entry.name}`}>
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
            {entry.variants.length > 0 && (
              <div className="mt-3">
                <VariantPicker compact variants={entry.variants} selected={entry.selectedOptions} onChange={(opts) => list.setOptions(entry.key, opts)} />
              </div>
            )}
            <div className="mt-3">
              <QuantityStepper size="sm" value={entry.qty} onChange={(v) => list.setQty(entry.key, v)} unit={entry.unit} />
            </div>
          </li>
        ))}
      </ul>

      <section className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">{t.quote.yourDetails}</h2>
        <Field label={t.quote.name} error={errors.name}>
          {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" invalid={!!errors.name} maxLength={120} />}
        </Field>
        <Field label={t.quote.country} error={errors.country}>
          {(id, describedBy) => <CountryPicker id={id} value={country} onChange={setCountry} invalid={!!errors.country} describedBy={describedBy} />}
        </Field>
        <Field label={t.quote.note} optional>
          {(id) => <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.quote.notePlaceholder} maxLength={1000} rows={3} />}
        </Field>
        {/* Honeypot: hidden from people, filled by bots. */}
        <div className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor="website">{t.quote.honeypotLabel}</label>
          <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
      </section>

      {formError && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError}
        </p>
      )}

      <div className="safe-bottom sticky bottom-0 mt-6 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <Button type="submit" size="lg" full loading={sending}>
          {sending ? t.quote.sending : t.quote.send}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmClear}
        message={t.quote.clearAllConfirm}
        confirmLabel={t.quote.clearAll}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          list.clear();
          setConfirmClear(false);
        }}
      />
    </form>
  );
}
