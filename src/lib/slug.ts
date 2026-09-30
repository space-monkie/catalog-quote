// Slug helpers shared by client, server and the seed script.

/** Category slugs that would clash with routes under /{store}/ (keep in sync with firestore.rules). */
export const RESERVED_CATEGORY_SLUGS = [
  "dashboard",
  "login",
  "api",
  "q",
  "quote",
  "signup",
  "admin",
  "settings",
  "share",
  "new",
  "static",
  "public",
  "assets",
  "_next",
];

/** Store slugs that would clash with top-level routes (keep in sync with firestore.rules). */
export const RESERVED_SLUGS = [...RESERVED_CATEGORY_SLUGS, "mcp", "oauth"];

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SLUG_LENGTH = 60;

/** Turns free text into a URL slug: lowercase ASCII letters, digits and single dashes. */
export function slugify(input: string, maxLength = MAX_SLUG_LENGTH): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  if (slug.length <= maxLength) return slug;
  return slug.slice(0, maxLength).replace(/-+$/g, "");
}

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug);
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug);
}

export function isReservedCategorySlug(slug: string): boolean {
  return RESERVED_CATEGORY_SLUGS.includes(slug);
}

/**
 * Prefix to range-query existing slugs before calling uniqueSlug(root, ...). uniqueSlug may
 * shorten `root` to fit a "-N" suffix (up to 6 chars), so query by that shortened stem.
 */
export function slugQueryStem(root: string, maxLength = MAX_SLUG_LENGTH): string {
  return root.slice(0, maxLength - 6).replace(/-+$/g, "");
}

/**
 * Returns `base` if free, otherwise `base-2`, `base-3`, … until it is not in `taken`.
 * Keeps the result within the maximum slug length.
 */
export function uniqueSlug(base: string, taken: Iterable<string>, maxLength = MAX_SLUG_LENGTH): string {
  const set = taken instanceof Set ? taken : new Set(taken);
  const root = base || "item";
  if (!set.has(root)) return root;
  for (let n = 2; n < 10_000; n++) {
    const suffix = `-${n}`;
    const candidate = root.slice(0, maxLength - suffix.length).replace(/-+$/g, "") + suffix;
    if (!set.has(candidate)) return candidate;
  }
  return `${root.slice(0, maxLength - 9)}-${Date.now().toString(36)}`;
}
