import { describe, expect, it } from "vitest";
import { isReservedSlug, isValidSlug, slugify, uniqueSlug, MAX_SLUG_LENGTH } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and replaces spaces and punctuation with single dashes", () => {
    expect(slugify("WP 801 7FT Royal Flora")).toBe("wp-801-7ft-royal-flora");
    expect(slugify("Compound Wall Moulds")).toBe("compound-wall-moulds");
    expect(slugify("  Hello,  World!! ")).toBe("hello-world");
  });

  it("strips diacritics and non-ASCII characters", () => {
    expect(slugify("Côte d'Ivoire")).toBe("cote-d-ivoire");
    expect(slugify("Türkiye Ürünleri")).toBe("turkiye-urunleri");
  });

  it("trims leading and trailing dashes", () => {
    expect(slugify("--abc--")).toBe("abc");
    expect(slugify("***")).toBe("");
  });

  it("caps the length without leaving a trailing dash", () => {
    const long = slugify("a ".repeat(100));
    expect(long.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(long.endsWith("-")).toBe(false);
  });
});

describe("isValidSlug / isReservedSlug", () => {
  it("accepts lowercase letters, digits and inner dashes", () => {
    expect(isValidSlug("jr-demo")).toBe(true);
    expect(isValidSlug("a1")).toBe(true);
    expect(isValidSlug("Jr")).toBe(false);
    expect(isValidSlug("-jr")).toBe(false);
    expect(isValidSlug("jr--demo")).toBe(false);
    expect(isValidSlug("")).toBe(false);
  });

  it("knows the slugs that clash with routes", () => {
    for (const s of ["dashboard", "login", "api", "q", "quote"]) expect(isReservedSlug(s)).toBe(true);
    expect(isReservedSlug("jr-demo")).toBe(false);
  });
});

describe("uniqueSlug", () => {
  it("returns the base when free", () => {
    expect(uniqueSlug("pillar", [])).toBe("pillar");
  });

  it("appends -2, -3 … when taken", () => {
    expect(uniqueSlug("pillar", ["pillar"])).toBe("pillar-2");
    expect(uniqueSlug("pillar", ["pillar", "pillar-2"])).toBe("pillar-3");
  });

  it("keeps the suffixed slug within the maximum length", () => {
    const base = "x".repeat(MAX_SLUG_LENGTH);
    const result = uniqueSlug(base, [base]);
    expect(result.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(result.endsWith("-2")).toBe(true);
  });

  it("falls back to 'item' for an empty base", () => {
    expect(uniqueSlug("", [])).toBe("item");
  });
});
