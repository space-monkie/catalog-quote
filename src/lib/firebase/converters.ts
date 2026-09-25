import type { DocumentData } from "firebase/firestore";
import type { Category, Item, Quote, Store } from "@/lib/schemas/types";
import { toMillis } from "@/lib/format";

// Firestore document -> plain app object. Shared by client SDK readers and
// (structurally identical) Admin SDK readers on the server.

export function storeFromData(id: string, d: DocumentData): Store {
  return {
    id,
    ownerId: String(d.ownerId ?? ""),
    name: String(d.name ?? ""),
    slug: String(d.slug ?? ""),
    logo: d.logo ?? null,
    about: String(d.about ?? ""),
    brandColor: String(d.brandColor ?? "#0f766e"),
    whatsappNumber: String(d.whatsappNumber ?? ""),
    quotePrefix: String(d.quotePrefix ?? "Q"),
    quoteCounter: Number(d.quoteCounter ?? 1000),
    showPrices: Boolean(d.showPrices),
    currency: String(d.currency ?? "INR"),
    createdAt: toMillis(d.createdAt),
    updatedAt: toMillis(d.updatedAt),
  };
}

export function categoryFromData(id: string, d: DocumentData): Category {
  const sections = Array.isArray(d.sections) ? d.sections : [];
  return {
    id,
    name: String(d.name ?? ""),
    slug: String(d.slug ?? ""),
    image: d.image ?? null,
    description: String(d.description ?? ""),
    order: Number(d.order ?? 0),
    visible: d.visible !== false,
    sections: sections
      .map((s: DocumentData) => ({
        id: String(s.id),
        name: String(s.name ?? ""),
        order: Number(s.order ?? 0),
        visible: s.visible !== false,
      }))
      .sort((a: { order: number }, b: { order: number }) => a.order - b.order),
  };
}

export function itemFromData(id: string, d: DocumentData): Item {
  return {
    id,
    categoryId: String(d.categoryId ?? ""),
    sectionId: d.sectionId ? String(d.sectionId) : null,
    name: String(d.name ?? ""),
    slug: String(d.slug ?? ""),
    code: String(d.code ?? ""),
    description: String(d.description ?? ""),
    images: Array.isArray(d.images) ? d.images : [],
    specs: Array.isArray(d.specs) ? d.specs : [],
    variants: Array.isArray(d.variants) ? d.variants : [],
    price: typeof d.price === "number" ? d.price : null,
    unit: String(d.unit ?? "pcs"),
    order: Number(d.order ?? 0),
    visible: d.visible !== false,
  };
}

export function quoteFromData(id: string, d: DocumentData): Quote {
  return {
    id,
    storeId: String(d.storeId ?? ""),
    quoteNumber: String(d.quoteNumber ?? ""),
    buyer: {
      name: String(d.buyer?.name ?? ""),
      country: String(d.buyer?.country ?? ""),
      note: String(d.buyer?.note ?? ""),
    },
    items: Array.isArray(d.items) ? d.items : [],
    status: d.status === "contacted" || d.status === "closed" ? d.status : "new",
    createdAt: toMillis(d.createdAt),
  };
}
