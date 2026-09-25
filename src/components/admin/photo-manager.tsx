"use client";

import { useRef, useState } from "react";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import { SortableList } from "./sortable-list";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { uploadImageAsset } from "@/lib/firebase/storage";
import { isImageFile } from "@/lib/images/compress";
import type { ImageAsset } from "@/lib/schemas/types";
import { MAX_ITEM_IMAGES } from "@/lib/schemas/types";
import { t } from "@/lib/i18n/en";

type Props = {
  basePath: string;
  images: ImageAsset[];
  onChange: (images: ImageAsset[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
};

/** Multi-photo picker: uploads immediately (compressed), reorder, pick cover, remove. */
export function PhotoManager({ basePath, images, onChange, onUploadingChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const list = Array.from(files).filter(isImageFile).slice(0, MAX_ITEM_IMAGES - images.length);
    if (!list.length) return;
    onUploadingChange?.(true);
    setProgress({ done: 0, total: list.length });
    let current = images;
    for (let i = 0; i < list.length; i++) {
      try {
        const asset = await uploadImageAsset(basePath, list[i]);
        current = [...current, asset];
        onChange(current);
      } catch (err) {
        console.error(err);
        toast(t.item.uploadFailed, "error");
      }
      setProgress({ done: i + 1, total: list.length });
    }
    setProgress(null);
    onUploadingChange?.(false);
  }

  const rows = images.map((img) => ({ id: img.path, img }));

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        aria-label={t.item.addPhotos}
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={Boolean(progress) || images.length >= MAX_ITEM_IMAGES}>
          <ImagePlus className="h-4 w-4" /> {t.item.addPhotos}
        </Button>
        {progress && (
          <span className="text-sm text-gray-600" role="status">
            {t.item.uploading(progress.done, progress.total)}
          </span>
        )}
      </div>
      {rows.length > 0 && (
        <SortableList
          items={rows}
          onReorder={(ids) => {
            const byPath = new Map(images.map((i) => [i.path, i]));
            onChange(ids.map((id) => byPath.get(id)!));
          }}
          renderItem={({ img }, { index, handle, moveButtons }) => (
            <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white pr-1">
              {handle}
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.thumbUrl} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 px-2">
                {index === 0 ? (
                  <Badge tone="brand">{t.item.cover}</Badge>
                ) : (
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--brand)]"
                    onClick={() => onChange([img, ...images.filter((i) => i.path !== img.path)])}
                  >
                    <Star className="h-4 w-4" /> {t.item.makeCover}
                  </button>
                )}
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center gap-1 text-sm text-red-600"
                  onClick={() => onChange(images.filter((i) => i.path !== img.path))}
                  aria-label={t.item.removePhoto}
                >
                  <Trash2 className="h-4 w-4" /> {t.common.remove}
                </button>
              </div>
              {moveButtons}
            </div>
          )}
        />
      )}
    </div>
  );
}
