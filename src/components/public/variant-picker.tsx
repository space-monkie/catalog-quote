"use client";

import type { VariantGroup } from "@/lib/schemas/types";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/en";

type Props = {
  variants: VariantGroup[];
  selected: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  compact?: boolean;
};

export function VariantPicker({ variants, selected, onChange, compact }: Props) {
  if (!variants.length) return null;
  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      {variants.map((group) => (
        <fieldset key={group.name}>
          <legend className={cn("mb-1.5 font-medium text-gray-800", compact ? "text-xs" : "text-sm")}>{group.name}</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.public.selectOption(group.name)}>
            {group.options.map((opt) => {
              const active = selected[group.name] === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange({ ...selected, [group.name]: opt })}
                  className={cn(
                    "rounded-full border font-medium",
                    compact ? "min-h-9 px-3 text-xs" : "min-h-11 px-4 text-sm",
                    active ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-text)]" : "border-gray-300 bg-white text-gray-800",
                  )}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
