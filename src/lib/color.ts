// Small color helpers for the brand color (hex, no dependencies).

export function normalizeHex(input: string, fallback = "#0f766e"): string {
  const v = input.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const [, r, g, b] = v;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

export function hexToRgb(hex: string): [number, number, number] {
  const v = normalizeHex(hex).slice(1);
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white text, whichever contrasts more with the given background. */
export function readableTextColor(background: string): "#ffffff" | "#111111" {
  return contrastRatio(background, "#ffffff") >= contrastRatio(background, "#111111") ? "#ffffff" : "#111111";
}

/** Mixes the color with white (ratio 0..1 of white). Used for soft tints. */
export function tint(hex: string, ratio: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * ratio);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Darkens the color (ratio 0..1 of black). Used for hover states. */
export function shade(hex: string, ratio: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c * (1 - ratio));
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Ensures the brand color is dark enough to be used as text/button color on white.
 * Returns the color unchanged when it already has enough contrast.
 */
export function accessibleBrand(hex: string): string {
  let color = normalizeHex(hex);
  let guard = 0;
  while (contrastRatio(color, "#ffffff") < 3 && guard < 20) {
    color = shade(color, 0.12);
    guard++;
  }
  return color;
}

/** CSS custom properties derived from a brand color. */
export function brandCssVars(brand: string): Record<string, string> {
  const base = accessibleBrand(brand);
  return {
    "--brand": base,
    "--brand-text": readableTextColor(base),
    "--brand-hover": shade(base, 0.15),
    "--brand-soft": tint(base, 0.9),
    "--brand-soft-text": shade(base, 0.35),
  };
}
