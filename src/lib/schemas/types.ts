// Plain application types. Firestore Timestamps are converted to epoch
// milliseconds at the read boundary so components and caches only see JSON.

export type ImageAsset = {
  path: string;
  thumbPath: string;
  url: string;
  thumbUrl: string;
};

export type Spec = { label: string; value: string };

export type VariantGroup = { name: string; options: string[] };

export type Section = {
  id: string;
  name: string;
  order: number;
  visible: boolean;
};

export type Store = {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  logo: ImageAsset | null;
  about: string;
  brandColor: string;
  whatsappNumber: string;
  quotePrefix: string;
  quoteCounter: number;
  showPrices: boolean;
  currency: string;
  createdAt: number;
  updatedAt: number;
};

/** The subset of a store that public pages need (safe to send to the browser). */
export type PublicStore = Pick<
  Store,
  "id" | "name" | "slug" | "logo" | "about" | "brandColor" | "showPrices" | "currency"
>;

export type Category = {
  id: string;
  name: string;
  slug: string;
  image: ImageAsset | null;
  description: string;
  order: number;
  visible: boolean;
  sections: Section[];
};

export type Item = {
  id: string;
  categoryId: string;
  sectionId: string | null;
  name: string;
  slug: string;
  code: string;
  description: string;
  images: ImageAsset[];
  specs: Spec[];
  variants: VariantGroup[];
  price: number | null;
  unit: string;
  order: number;
  visible: boolean;
};

export type QuoteStatus = "new" | "contacted" | "closed";
export const QUOTE_STATUSES: QuoteStatus[] = ["new", "contacted", "closed"];

export type QuoteItem = {
  itemId: string;
  name: string;
  code: string;
  selectedOptions: Record<string, string>;
  qty: number;
  unit: string;
  thumbUrl: string | null;
};

export type QuoteBuyer = { name: string; country: string; note: string };

export type Quote = {
  id: string;
  storeId: string;
  quoteNumber: string;
  buyer: QuoteBuyer;
  items: QuoteItem[];
  status: QuoteStatus;
  createdAt: number;
};

export type UserProfile = { email: string; name: string; createdAt: number };

export const DEFAULT_UNITS = ["pcs", "sets"] as const;
export const DEFAULT_BRAND_COLOR = "#0f766e";
export const DEFAULT_CURRENCY = "INR";
export const MAX_ITEM_IMAGES = 12;
