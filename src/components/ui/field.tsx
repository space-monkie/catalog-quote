import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const inputClass =
  "block w-full min-h-11 rounded-xl border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 " +
  "placeholder:text-gray-400 focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30 " +
  "disabled:bg-gray-50 disabled:text-gray-500 aria-[invalid=true]:border-red-500";

type FieldProps = {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  className?: string;
};

/** Label + control + hint + error, wired with ids for screen readers. */
export function Field({ label, hint, error, optional, children, className }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-800">
        {label}
        {optional && <span className="ml-1 font-normal text-gray-500">(optional)</span>}
      </label>
      {children(id, describedBy)}
      {hint && !error && (
        <p id={hintId} className="text-xs text-gray-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return <input ref={ref} className={cn(inputClass, className)} aria-invalid={invalid || undefined} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...rest }, ref) {
    return <textarea ref={ref} className={cn(inputClass, "min-h-24", className)} aria-invalid={invalid || undefined} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ className, invalid, children, ...rest }, ref) {
    return (
      <select ref={ref} className={cn(inputClass, "pr-8", className)} aria-invalid={invalid || undefined} {...rest}>
        {children}
      </select>
    );
  },
);

export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-6 w-11 rounded-full bg-gray-300 transition-colors peer-checked:bg-[var(--brand)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--brand)] peer-focus-visible:ring-offset-2" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-medium text-gray-800">{label}</span>
        {hint && <span className="text-xs text-gray-500">{hint}</span>}
      </span>
    </label>
  );
}
