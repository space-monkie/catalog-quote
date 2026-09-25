import { describe, expect, it } from "vitest";
import { accessibleBrand, brandCssVars, contrastRatio, normalizeHex, readableTextColor } from "@/lib/color";

describe("color helpers", () => {
  it("normalizes short and invalid hex values", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("nope")).toBe("#0f766e");
  });

  it("picks white text on dark and black text on light backgrounds", () => {
    expect(readableTextColor("#1d4ed8")).toBe("#ffffff");
    expect(readableTextColor("#fde047")).toBe("#111111");
  });

  it("darkens very light brand colors until buttons are readable", () => {
    const fixed = accessibleBrand("#ffff99");
    expect(contrastRatio(fixed, "#ffffff")).toBeGreaterThanOrEqual(3);
    expect(accessibleBrand("#1d4ed8")).toBe("#1d4ed8");
  });

  it("produces the CSS variables used by the theme", () => {
    const vars = brandCssVars("#1d4ed8");
    expect(Object.keys(vars)).toEqual(["--brand", "--brand-text", "--brand-hover", "--brand-soft", "--brand-soft-text"]);
  });
});
