"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/en";

export type TabSection = { id: string; name: string };

/** Sticky, horizontally scrolling tabs that jump to sections and highlight the one in view. */
export function SectionTabs({ sections }: { sections: TabSection[] }) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? "");
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sections.length < 2) return;
    const elements = sections
      .map((s) => document.getElementById(`section-${s.id}`))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!elements.length) return;

    // Track which section is closest below the sticky bars.
    const onScroll = () => {
      const offset = 120;
      let current = elements[0].id;
      for (const el of elements) {
        if (el.getBoundingClientRect().top - offset <= 0) current = el.id;
      }
      setActive(current.replace("section-", ""));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sections]);

  useEffect(() => {
    const bar = barRef.current;
    const btn = bar?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    if (bar && btn) {
      const left = btn.offsetLeft - bar.clientWidth / 2 + btn.clientWidth / 2;
      bar.scrollTo({ left, behavior: "smooth" });
    }
  }, [active]);

  if (sections.length < 2) return null;

  return (
    <div className="sticky top-14 z-20 -mx-4 mt-3 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div ref={barRef} className="no-scrollbar flex gap-1 overflow-x-auto px-3" role="tablist" aria-label={t.public.sections}>
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#section-${s.id}`}
            data-id={s.id}
            role="tab"
            aria-selected={active === s.id}
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById(`section-${s.id}`);
              if (el) {
                const top = el.getBoundingClientRect().top + window.scrollY - 112;
                window.scrollTo({ top, behavior: "smooth" });
                setActive(s.id);
              }
            }}
            className={cn(
              "flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium",
              active === s.id ? "border-[var(--brand)] text-[var(--brand)]" : "border-transparent text-gray-600",
            )}
          >
            {s.name}
          </a>
        ))}
      </div>
    </div>
  );
}
