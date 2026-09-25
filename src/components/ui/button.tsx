import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "sm";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  full?: boolean;
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors select-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] " +
  "disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary: "bg-[var(--brand)] text-[var(--brand-text)] hover:bg-[var(--brand-hover)]",
  secondary: "bg-white text-gray-900 border border-gray-300 hover:bg-gray-50",
  ghost: "bg-transparent text-gray-800 hover:bg-gray-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

const sizes: Record<Size, string> = {
  sm: "min-h-11 px-3 text-sm",
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, full, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(base, variants[variant], sizes[size], full && "w-full", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
});

export const buttonClass = (variant: Variant = "primary", size: Size = "md", className?: string) =>
  cn(base, variants[variant], sizes[size], className);
