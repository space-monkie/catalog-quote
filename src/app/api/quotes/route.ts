import { NextResponse } from "next/server";
import { quoteRequestSchema } from "@/lib/schemas";
import type { QuoteItem } from "@/lib/schemas/types";
import { getCategoriesByIdsFresh, getItemsByIdsFresh, getStoreBySlugFresh } from "@/lib/server/catalog";
import { createQuote } from "@/lib/server/quotes";
import { QUOTE_RATE_LIMIT, checkRateLimit, clientIp } from "@/lib/server/rate-limit";
import { verifyAppCheck } from "@/lib/server/app-check";
import { buildWhatsAppMessage, buildWhatsAppUrl } from "@/lib/whatsapp";
import { absoluteUrl } from "@/lib/format";

export const runtime = "nodejs";

/**
 * POST /api/quotes — buyers submit their quote list.
 * Validates the body, checks every item against the live catalog, assigns the
 * per-store sequential number in a transaction and returns the WhatsApp hand-off URL.
 */
export async function POST(request: Request) {
  if (!(await verifyAppCheck(request))) {
    return NextResponse.json({ error: "app-check" }, { status: 401 });
  }

  const ip = clientIp(request);
  const limit = checkRateLimit(`quotes:${ip}`, QUOTE_RATE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate-limited" },
      { status: 429, headers: { "retry-after": String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }
  const parsed = quoteRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  const body = parsed.data;

  // Honeypot: humans never fill this field.
  if (body.website) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const store = await getStoreBySlugFresh(body.storeSlug);
  if (!store) return NextResponse.json({ error: "store-not-found" }, { status: 404 });

  const itemIds = body.items.map((i) => i.itemId);
  const catalog = await getItemsByIdsFresh(store.id, itemIds);
  const categories = await getCategoriesByIdsFresh(
    store.id,
    Array.from(catalog.values()).map((i) => i.categoryId),
  );

  const missing: string[] = [];
  const quoteItems: QuoteItem[] = [];
  for (const requested of body.items) {
    const item = catalog.get(requested.itemId);
    const category = item ? categories.get(item.categoryId) : undefined;
    if (!item || !item.visible || !category || !category.visible) {
      missing.push(requested.itemId);
      continue;
    }
    // Keep only options that exist on the item; ignore anything else.
    const selectedOptions: Record<string, string> = {};
    for (const group of item.variants) {
      const chosen = requested.selectedOptions[group.name];
      if (chosen && group.options.includes(chosen)) selectedOptions[group.name] = chosen;
    }
    quoteItems.push({
      itemId: item.id,
      name: item.name,
      code: item.code,
      selectedOptions,
      qty: requested.qty,
      unit: item.unit,
      thumbUrl: item.images[0]?.thumbUrl ?? null,
    });
  }

  if (missing.length) {
    return NextResponse.json({ error: "items", missing }, { status: 422 });
  }

  const { id, quoteNumber } = await createQuote({ storeId: store.id, buyer: body.buyer, items: quoteItems });

  const quoteUrl = absoluteUrl(`/q/${id}`);
  const message = buildWhatsAppMessage({
    storeName: store.name,
    quoteNumber,
    items: quoteItems,
    buyer: body.buyer,
    quoteUrl,
  });

  return NextResponse.json({
    quoteId: id,
    quoteNumber,
    quoteUrl,
    whatsappUrl: buildWhatsAppUrl(store.whatsappNumber, message),
  });
}
