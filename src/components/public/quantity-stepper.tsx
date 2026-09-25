"use client";

import { Minus, Plus } from "lucide-react";
import { t } from "@/lib/i18n/en";

export function QuantityStepper({ value, onChange, unit, size = "md" }: { value: number; onChange: (v: number) => void; unit?: string; size?: "sm" | "md" }) {
  const btn = size === "sm" ? "h-11 w-11" : "h-12 w-12";
  return (
    <div className="inline-flex items-center rounded-xl border border-gray-300 bg-white">
      <button type="button" className={`${btn} flex items-center justify-center text-gray-700 disabled:opacity-40`} onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label={t.public.decrease}>
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={99999}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!Number.isNaN(n)) onChange(n);
        }}
        className="w-14 border-x border-gray-300 py-2 text-center text-base text-gray-900 [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        aria-label={t.public.quantity}
      />
      <button type="button" className={`${btn} flex items-center justify-center text-gray-700`} onClick={() => onChange(value + 1)} aria-label={t.public.increase}>
        <Plus className="h-4 w-4" />
      </button>
      {unit && <span className="pr-3 text-sm text-gray-600">{unit}</span>}
    </div>
  );
}
