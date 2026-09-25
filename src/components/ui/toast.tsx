"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Toast = { id: number; message: string; kind: "success" | "error" | "info" };
type ToastContextValue = { toast: (message: string, kind?: Toast["kind"]) => void };

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const toast = useCallback((message: string, kind: Toast["kind"] = "success") => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), kind === "error" ? 6000 : 3000);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto max-w-sm rounded-xl px-4 py-3 text-sm shadow-lg",
              t.kind === "error" ? "bg-red-600 text-white" : t.kind === "info" ? "bg-gray-800 text-white" : "bg-gray-900 text-white",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
