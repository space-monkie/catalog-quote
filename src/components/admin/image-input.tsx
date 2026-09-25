"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isImageFile } from "@/lib/images/compress";
import { t } from "@/lib/i18n/en";
import type { ImageAsset } from "@/lib/schemas/types";

type Props = {
  label: string;
  value: ImageAsset | null;
  /** Called with the chosen file (upload happens on save) or null to remove. */
  onChange: (file: File | null) => void;
  /** Local preview for a pending file. */
  pendingFile: File | null;
  removed: boolean;
  shape?: "square" | "wide";
};

/** Single-image picker with local preview; the parent uploads on save. */
export function ImageInput({ label, value, onChange, pendingFile, removed, shape = "square" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const preview = pendingFile ? previewUrl : removed ? null : value?.thumbUrl ?? null;

  return (
    <div className="flex items-center gap-4">
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 ${
          shape === "square" ? "h-20 w-20" : "h-20 w-32"
        }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImagePlus className="h-6 w-6 text-gray-400" aria-hidden="true" />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label={label}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file || !isImageFile(file)) return;
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(URL.createObjectURL(file));
            onChange(file);
          }}
        />
        <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
          <ImagePlus className="h-4 w-4" /> {label}
        </Button>
        {preview && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (previewUrl) URL.revokeObjectURL(previewUrl);
              setPreviewUrl(null);
              onChange(null);
            }}
          >
            <Trash2 className="h-4 w-4" /> {t.common.remove}
          </Button>
        )}
      </div>
    </div>
  );
}
