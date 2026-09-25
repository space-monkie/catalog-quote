import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({ title, hint, action, className }: { title: string; hint?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center", className)}>
      <p className="text-base font-medium text-gray-800">{title}</p>
      {hint && <p className="mt-1 text-sm text-gray-500">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "brand" | "amber" | "green" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-700",
    brand: "bg-[var(--brand-soft)] text-[var(--brand-soft-text)]",
    amber: "bg-amber-100 text-amber-800",
    green: "bg-green-100 text-green-800",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function ErrorBox({ message, onRetry, retryLabel }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 min-h-11 font-medium underline">
          {retryLabel ?? "Try again"}
        </button>
      )}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-gray-200 bg-white", className)}>{children}</div>;
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
