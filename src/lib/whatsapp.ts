import { t } from "@/lib/i18n/en";
import type { QuoteBuyer, QuoteItem } from "@/lib/schemas/types";

export const WHATSAPP_MAX_LINES = 10;

export type WhatsAppMessageInput = {
  storeName: string;
  quoteNumber: string;
  items: QuoteItem[];
  buyer: QuoteBuyer;
  quoteUrl: string;
  maxLines?: number;
};

/** "Material: Rubber, Size: 7 ft" -> "Rubber, 7 ft" (values only, in group order). */
export function formatSelectedOptions(selected: Record<string, string> | undefined): string {
  if (!selected) return "";
  return Object.values(selected)
    .map((v) => v.trim())
    .filter(Boolean)
    .join(", ");
}

/** One numbered line: "1. CODE, Name, Option × 2 pcs" */
export function formatQuoteLine(index: number, item: QuoteItem): string {
  const parts = [item.code?.trim(), item.name.trim(), formatSelectedOptions(item.selectedOptions)].filter(
    (p): p is string => Boolean(p),
  );
  const unit = item.unit?.trim();
  return `${index}. ${parts.join(", ")} × ${item.qty}${unit ? ` ${unit}` : ""}`;
}

/** Builds the plain-text WhatsApp message (not URL-encoded). */
export function buildWhatsAppMessage(input: WhatsAppMessageInput): string {
  const maxLines = input.maxLines ?? WHATSAPP_MAX_LINES;
  const shown = input.items.slice(0, maxLines);
  const remaining = input.items.length - shown.length;

  const lines: string[] = [];
  lines.push(t.whatsapp.greeting(input.storeName));
  lines.push(t.whatsapp.quoteNumber(input.quoteNumber));
  lines.push("");
  shown.forEach((item, i) => lines.push(formatQuoteLine(i + 1, item)));
  if (remaining > 0) lines.push(t.whatsapp.more(remaining));
  lines.push("");
  lines.push(`${t.whatsapp.name}: ${input.buyer.name.trim()}`);
  lines.push(`${t.whatsapp.country}: ${input.buyer.country.trim()}`);
  const note = input.buyer.note?.trim();
  if (note) lines.push(`${t.whatsapp.note}: ${note}`);
  lines.push("");
  lines.push(`${t.whatsapp.details}: ${input.quoteUrl}`);
  return lines.join("\n");
}

/** "+91 98765 43210" -> "919876543210" */
export function whatsappDigits(number: string): string {
  return number.replace(/\D/g, "");
}

export function buildWhatsAppUrl(whatsappNumber: string, message: string): string {
  return `https://wa.me/${whatsappDigits(whatsappNumber)}?text=${encodeURIComponent(message)}`;
}
