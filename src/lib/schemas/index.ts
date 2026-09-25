import { z } from "zod";
import { RESERVED_SLUGS, SLUG_PATTERN } from "@/lib/slug";

// zod schemas shared by client forms, the seed script and API routes.

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(SLUG_PATTERN, "Use lowercase letters, numbers and dashes");

export const storeSlugSchema = slugSchema
  .min(3, "At least 3 characters")
  .refine((s) => !RESERVED_SLUGS.includes(s), "This link is reserved");

export const imageAssetSchema = z.object({
  path: z.string(),
  thumbPath: z.string(),
  url: z.string(),
  thumbUrl: z.string(),
});

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #0f766e");

export const e164Schema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, "Enter the number with country code, e.g. +919876543210");

export const storeFormSchema = z.object({
  name: z.string().trim().min(2, "At least 2 characters").max(80),
  slug: storeSlugSchema,
  logo: imageAssetSchema.nullable(),
  about: z.string().trim().max(600).default(""),
  brandColor: hexColorSchema,
  whatsappNumber: e164Schema,
  quotePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,8}$/, "1 to 8 letters or numbers"),
  showPrices: z.boolean(),
  currency: z.string().trim().toUpperCase().length(3, "3-letter code like INR"),
});
export type StoreForm = z.infer<typeof storeFormSchema>;

export const sectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  order: z.number(),
  visible: z.boolean(),
});

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
  slug: slugSchema.refine((s) => !RESERVED_SLUGS.includes(s), "This link is reserved"),
  description: z.string().trim().max(1000).default(""),
  image: imageAssetSchema.nullable(),
  visible: z.boolean(),
});
export type CategoryForm = z.infer<typeof categoryFormSchema>;

export const specSchema = z.object({
  label: z.string().trim().max(80),
  value: z.string().trim().max(300),
});

export const variantGroupSchema = z.object({
  name: z.string().trim().min(1).max(60),
  options: z.array(z.string().trim().min(1).max(60)).min(1).max(30),
});

export const itemFormSchema = z.object({
  categoryId: z.string().min(1),
  sectionId: z.string().nullable(),
  name: z.string().trim().min(1, "Enter a name").max(120),
  slug: slugSchema,
  code: z.string().trim().max(60).default(""),
  description: z.string().trim().max(3000).default(""),
  images: z.array(imageAssetSchema).max(12),
  specs: z.array(specSchema).max(40),
  variants: z.array(variantGroupSchema).max(10),
  price: z.number().min(0).nullable(),
  unit: z.string().trim().min(1, "Choose a unit").max(20),
  visible: z.boolean(),
});
export type ItemForm = z.infer<typeof itemFormSchema>;

// ---- quote request (browser -> /api/quotes) ----
export const quoteRequestItemSchema = z.object({
  itemId: z.string().min(1).max(64),
  selectedOptions: z.record(z.string().max(60), z.string().max(60)).default({}),
  qty: z.number().int().min(1).max(99999),
});

export const quoteRequestSchema = z.object({
  storeSlug: slugSchema,
  buyer: z.object({
    name: z.string().trim().min(1).max(120),
    country: z.string().trim().min(1).max(80),
    note: z.string().trim().max(1000).default(""),
  }),
  items: z.array(quoteRequestItemSchema).min(1).max(100),
  // Honeypot: real users never see or fill this.
  website: z.string().max(200).optional().default(""),
});
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export const quoteStatusSchema = z.enum(["new", "contacted", "closed"]);

/** Flattens a zod error into { fieldName: firstMessage } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : "_";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
