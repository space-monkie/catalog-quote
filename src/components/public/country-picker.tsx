"use client";

import { useEffect, useId, useRef, useState } from "react";
import { inputClass } from "@/components/ui/field";
import { searchCountries } from "@/lib/countries";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/en";

type Props = { value: string; onChange: (country: string) => void; invalid?: boolean; id?: string; describedBy?: string };

/** Searchable country list (combobox) that works well with a phone keyboard. */
export function CountryPicker({ value, onChange, invalid, id: idProp, describedBy }: Props) {
  const generated = useId();
  const id = idProp ?? generated;
  const listId = `${id}-list`;
  // `query` is only the text typed while the list is open; closed, the input shows `value`.
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const shown = open ? query : value;
  const results = searchCountries(query, 60);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  function choose(name: string) {
    onChange(name);
    setOpen(false);
  }

  function openList() {
    setQuery(value);
    setHighlight(0);
    setOpen(true);
  }

  return (
    <div ref={wrap} className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results[highlight] ? `${listId}-${results[highlight].code}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className={cn(inputClass)}
        placeholder={t.quote.countryPlaceholder}
        value={shown}
        autoComplete="off"
        onFocus={openList}
        onChange={(e) => {
          if (!open) setOpen(true);
          setQuery(e.target.value);
          setHighlight(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) openList();
            else setHighlight((h) => Math.min(results.length - 1, h + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(0, h - 1));
          } else if (e.key === "Enter" && open && results[highlight]) {
            e.preventDefault();
            choose(results[highlight].name);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">{t.quote.noCountry}</li>}
          {results.map((c, i) => (
            <li
              key={c.code}
              id={`${listId}-${c.code}`}
              role="option"
              aria-selected={c.name === value}
              className={cn("flex min-h-11 cursor-pointer items-center px-3 text-sm", i === highlight ? "bg-[var(--brand-soft)] text-[var(--brand-soft-text)]" : "text-gray-800")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(c.name)}
              onMouseEnter={() => setHighlight(i)}
            >
              {c.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
