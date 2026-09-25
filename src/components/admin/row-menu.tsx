"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/en";

export type MenuAction = { label: string; onSelect: () => void; danger?: boolean; icon?: ReactNode };

/** Small "⋮" menu with 44px targets; closes on outside click and Escape. */
export function RowMenu({ actions, label }: { actions: MenuAction[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label ?? t.common.menu}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreVertical className="h-5 w-5" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              className={cn(
                "flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-gray-50",
                a.danger ? "text-red-600" : "text-gray-800",
              )}
              onClick={() => {
                setOpen(false);
                a.onSelect();
              }}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
