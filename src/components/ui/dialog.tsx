"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { t } from "@/lib/i18n/en";
import { cn } from "@/lib/cn";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
};

/** Native <dialog>-based modal: focus trap, Escape and backdrop close for free. */
export function Dialog({ open, onClose, title, children, footer, size = "md" }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", handleCancel);
    return () => el.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  const widths = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl" };

  return (
    <dialog
      ref={ref}
      className={cn(
        "m-0 w-full max-w-none bg-transparent p-0 backdrop:bg-black/40 open:flex",
        "fixed inset-0 h-full max-h-none items-end justify-center sm:items-center sm:p-4",
      )}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div
        className={cn(
          "flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl",
          widths[size],
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <h2 id="dialog-title" className="text-base font-semibold text-gray-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
            aria-label={t.common.close}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-gray-200 px-4 py-3 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </dialog>
  );
}

type ConfirmProps = {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ open, title, message, confirmLabel, danger = true, loading, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title ?? t.common.confirmTitle}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {t.common.cancel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel ?? t.common.delete}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-700">{message}</p>
    </Dialog>
  );
}
