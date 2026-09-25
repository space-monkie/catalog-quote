export function formatPrice(amount: number, currency: string, locale = "en-IN"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export function formatDate(ms: number, locale = "en-IN"): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}

/** Firestore Timestamp | Date | number | undefined -> epoch ms (0 when missing). */
export function toMillis(value: unknown): number {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export function absoluteUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
