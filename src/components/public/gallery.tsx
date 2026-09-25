"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ImageAsset } from "@/lib/schemas/types";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/en";

/** Swipeable (scroll-snap) photo gallery with dots and prev/next buttons. */
export function Gallery({ images, alt }: { images: ImageAsset[]; alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  function go(i: number) {
    const el = ref.current;
    if (!el) return;
    const next = Math.max(0, Math.min(images.length - 1, i));
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  }

  if (images.length === 0) {
    return <div className="flex aspect-square items-center justify-center rounded-2xl bg-gray-100 text-sm text-gray-400">{t.public.noPhoto}</div>;
  }

  return (
    <div className="relative">
      <div ref={ref} className="snap-gallery no-scrollbar flex aspect-square w-full overflow-x-auto rounded-2xl bg-gray-100" aria-roledescription="carousel" aria-label={t.public.gallery}>
        {images.map((img, i) => (
          <div key={img.path} className="h-full w-full shrink-0" role="group" aria-label={t.public.photoOf(i + 1, images.length)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={i === 0 ? alt : ""} className="h-full w-full object-contain" loading={i === 0 ? "eager" : "lazy"} decoding="async" />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <>
          <button type="button" onClick={() => go(index - 1)} className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow" aria-label={t.public.prevPhoto} disabled={index === 0}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => go(index + 1)} className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow" aria-label={t.public.nextPhoto} disabled={index === images.length - 1}>
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="mt-2 flex justify-center gap-1.5" aria-hidden="true">
            {images.map((img, i) => (
              <span key={img.path} className={cn("h-1.5 w-1.5 rounded-full", i === index ? "bg-[var(--brand)]" : "bg-gray-300")} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
