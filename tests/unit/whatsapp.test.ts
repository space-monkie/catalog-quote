import { describe, expect, it } from "vitest";
import { buildWhatsAppMessage, buildWhatsAppUrl, formatQuoteLine, formatSelectedOptions, whatsappDigits } from "@/lib/whatsapp";
import type { QuoteItem } from "@/lib/schemas/types";

const item = (over: Partial<QuoteItem> = {}): QuoteItem => ({
  itemId: "i1",
  name: "WP 801 7FT Royal Flora",
  code: "WP 801",
  selectedOptions: { Material: "Rubber" },
  qty: 2,
  unit: "pcs",
  thumbUrl: null,
  ...over,
});

const base = {
  storeName: "JR Rubber Industries",
  quoteNumber: "JR-1001",
  buyer: { name: "Amina Okafor", country: "Nigeria", note: "" },
  quoteUrl: "https://example.com/q/abc123",
};

describe("formatSelectedOptions", () => {
  it("joins option values in group order", () => {
    expect(formatSelectedOptions({ Material: "Rubber", Size: "7 ft" })).toBe("Rubber, 7 ft");
    expect(formatSelectedOptions({})).toBe("");
    expect(formatSelectedOptions(undefined)).toBe("");
  });
});

describe("formatQuoteLine", () => {
  it("renders code, name, options × qty unit", () => {
    expect(formatQuoteLine(1, item())).toBe("1. WP 801, WP 801 7FT Royal Flora, Rubber × 2 pcs");
  });

  it("skips empty code and options", () => {
    expect(formatQuoteLine(3, item({ code: "", selectedOptions: {} }))).toBe("3. WP 801 7FT Royal Flora × 2 pcs");
  });

  it("omits the unit when empty", () => {
    expect(formatQuoteLine(1, item({ unit: "" }))).toBe("1. WP 801, WP 801 7FT Royal Flora, Rubber × 2");
  });
});

describe("buildWhatsAppMessage", () => {
  it("includes greeting, quote number, numbered lines, buyer details and link", () => {
    const msg = buildWhatsAppMessage({ ...base, items: [item(), item({ itemId: "i2", name: "C 401 Coping", code: "C 401", qty: 10, selectedOptions: {} })] });
    const lines = msg.split("\n");
    expect(lines[0]).toContain("JR Rubber Industries");
    expect(lines[1]).toBe("Quote JR-1001");
    expect(msg).toContain("1. WP 801, WP 801 7FT Royal Flora, Rubber × 2 pcs");
    expect(msg).toContain("2. C 401, C 401 Coping × 10 pcs");
    expect(msg).toContain("Name: Amina Okafor");
    expect(msg).toContain("Country: Nigeria");
    expect(msg).not.toContain("Note:");
    expect(msg.trim().endsWith("https://example.com/q/abc123")).toBe(true);
  });

  it("adds the note when present", () => {
    const msg = buildWhatsAppMessage({ ...base, buyer: { ...base.buyer, note: "Need by March" }, items: [item()] });
    expect(msg).toContain("Note: Need by March");
  });

  it("caps at 10 lines and adds +N more", () => {
    const items = Array.from({ length: 13 }, (_, i) => item({ itemId: `i${i}`, name: `Item ${i + 1}` }));
    const msg = buildWhatsAppMessage({ ...base, items });
    expect(msg).toContain("10. WP 801, Item 10, Rubber × 2 pcs");
    expect(msg).not.toContain("11. ");
    expect(msg).toContain("+3 more");
  });

  it("does not add +N more when exactly at the limit", () => {
    const items = Array.from({ length: 10 }, (_, i) => item({ itemId: `i${i}` }));
    expect(buildWhatsAppMessage({ ...base, items })).not.toContain("more");
  });
});

describe("buildWhatsAppUrl", () => {
  it("keeps only digits from the E.164 number", () => {
    expect(whatsappDigits("+91 98765-43210")).toBe("919876543210");
  });

  it("URL-encodes the message", () => {
    const url = buildWhatsAppUrl("+919876543210", "Hello JR\nQuote JR-1001 × 2");
    expect(url.startsWith("https://wa.me/919876543210?text=")).toBe(true);
    expect(url).toContain("%0A");
    expect(url).toContain("%C3%97"); // ×
    expect(decodeURIComponent(url.split("text=")[1])).toBe("Hello JR\nQuote JR-1001 × 2");
  });
});
