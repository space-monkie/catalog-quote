"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { QuantityStepper } from "./quantity-stepper";
import { VariantPicker } from "./variant-picker";
import { useQuoteList } from "@/lib/quote-list";
import type { Item } from "@/lib/schemas/types";
import { t } from "@/lib/i18n/en";

type Props = { item: Item; storeSlug: string; categorySlug: string };

export function AddToQuote({ item, storeSlug, categorySlug }: Props) {
  const { add } = useQuoteList();
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(item.variants.filter((v) => v.options.length).map((v) => [v.name, v.options[0]])),
  );
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  function submit() {
    add({
      itemId: item.id,
      name: item.name,
      code: item.code,
      unit: item.unit,
      thumbUrl: item.images[0]?.thumbUrl ?? null,
      categorySlug,
      itemSlug: item.slug,
      variants: item.variants,
      selectedOptions: selected,
      qty,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 3000);
  }

  return (
    <div className="space-y-4">
      <VariantPicker variants={item.variants} selected={selected} onChange={setSelected} />
      <div>
        <p className="mb-1.5 text-sm font-medium text-gray-800">{t.public.quantity}</p>
        <QuantityStepper value={qty} onChange={(v) => setQty(Math.max(1, Math.min(99999, v)))} unit={item.unit} />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" onClick={submit} className="flex-1">
          {added ? <Check className="h-5 w-5" /> : null}
          {added ? t.public.addedToQuote : t.public.addToQuote}
        </Button>
        {added && (
          <Link href={`/${storeSlug}/quote`} className={buttonClass("secondary", "lg", "flex-1")}>
            {t.public.viewQuote}
          </Link>
        )}
      </div>
    </div>
  );
}
