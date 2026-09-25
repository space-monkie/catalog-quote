import { cn } from "@/lib/cn";

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className ?? "h-5 w-5")} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function PageSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-gray-500" role="status" aria-live="polite">
      <Spinner className="h-6 w-6" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
