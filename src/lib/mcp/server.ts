import "server-only";
import { McpServer, requireScopes, type McpRequestContext } from "@modelcontextprotocol/server";
import { z } from "zod";
import { SCOPES } from "@/lib/oauth/config";
import {
  addSection,
  createCategory,
  createItem,
  getCatalog,
  getItemDetail,
  getQuote,
  listAccessibleStores,
  listQuotes,
  resolveStore,
  setVisibility,
  storeSummary,
  ToolError,
  updateCategory,
  updateItem,
  updateQuoteStatus,
  type Access,
} from "./catalog-ops";

// The Catalog Quote MCP server. One instance per HTTP request (stateless). A connection only
// sees the tools its grant allows (read-only connections get no write tools), and tools act
// only on the stores the owner picked on the consent screen.

const BASE_INSTRUCTIONS = `Catalog Quote lets a business owner manage the product catalog their buyers browse, and the quote requests buyers send.
- Start with list_stores, then get_catalog to learn category, section and item ids. Use ids exactly as returned (store can also be its slug, like "jr-demo").
- Catalog structure: category (a page) > section (a block on that page) > item (a product with its own page).
- New categories and items are always created HIDDEN. Only publish (set_visibility visible=true) when the owner asked for it in this conversation, and ask before hiding anything that is live. An item is public only when both it and its category are visible.
- update_item replaces specs and variants as a whole; send the complete list when changing them.
- Specs are free-form label/value rows (e.g. "Approx. mould weight" / "12 kg"). Variants are option groups the buyer picks from (e.g. Material: Rubber, PVC, Plastic).
- This connector cannot add photos or delete anything. If the owner asks to delete something, say it can't be done here and offer to hide it; photos are added in the dashboard.
- Quote statuses: new, contacted, closed.
- The connection only covers the stores the owner picked when connecting; to add a store they reconnect this connector and tick it.`;

function instructionsFor(canEditCatalog: boolean, canUpdateQuotes: boolean): string {
  if (canEditCatalog && canUpdateQuotes) return BASE_INSTRUCTIONS;
  const missing = [!canEditCatalog && "change the catalog", !canUpdateQuotes && "update quote status"].filter(Boolean).join(" or ");
  return `${BASE_INSTRUCTIONS}
- This connection can't ${missing}. If the owner wants that, they reconnect this connector with "Allow changes" turned on.`;
}

const idPattern = /^[A-Za-z0-9_-]+$/;
const idArg = (what: string) => z.string().min(1).max(64).regex(idPattern, `Use the ${what} id exactly as returned by get_catalog`);
const storeArg = z.string().min(1).max(200).describe('Store id or slug from list_stores, e.g. "jr-demo"');
const quoteArg = z.string().min(1).max(64).regex(idPattern, 'Use a quote number like "JR-1001" or an id from list_quotes').describe('Quote number like "JR-1001", or its id');
const specArg = z.object({ label: z.string().trim().min(1).max(80), value: z.string().trim().max(300) });
const variantArg = z.object({
  name: z.string().trim().min(1).max(60).describe('Option group name, e.g. "Material"'),
  options: z.array(z.string().trim().min(1).max(60)).min(1).max(30).describe('Choices, e.g. ["Rubber", "PVC", "Plastic"]'),
});
const statusArg = z.enum(["new", "contacted", "closed"]);

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const additive = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
/** Overwrites existing data: clients should confirm these. */
const overwrite = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const;
/** Changes what is visible on the public web. */
const publish = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true } as const;

type Ctx = { http?: { authInfo?: { extra?: Record<string, unknown>; scopes?: string[] } } };

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function accessFrom(ctx: Ctx): Access {
  const extra = ctx.http?.authInfo?.extra ?? {};
  return { uid: String(extra.uid ?? ""), storeIds: Array.isArray(extra.storeIds) ? (extra.storeIds as string[]) : [] };
}

/** Runs a tool body, turning expected problems into tool errors the assistant can act on. */
async function run(tool: string, ctx: Ctx, body: (access: Access) => Promise<unknown>) {
  try {
    return ok(await body(accessFrom(ctx)));
  } catch (err) {
    if (err instanceof ToolError) return { content: [{ type: "text" as const, text: err.message }], isError: true };
    console.error(`[mcp tool] ${tool} failed for grant ${String(ctx.http?.authInfo?.extra?.grantId ?? "?")}:`, (err as Error)?.message);
    return {
      content: [{ type: "text" as const, text: "Something went wrong on the server. Try once more; if it keeps failing, ask the owner to check the dashboard." }],
      isError: true,
    };
  }
}

export function buildMcpServer({ authInfo }: McpRequestContext): McpServer {
  const scopes = new Set(authInfo?.scopes ?? []);
  const can = (scope: string) => scopes.has(scope);
  const server = new McpServer(
    { name: "catalog-quote", version: "1.0.0" },
    { instructions: instructionsFor(can(SCOPES.catalogWrite), can(SCOPES.quotesWrite)) },
  );

  // ---------- catalog: read ----------
  if (can(SCOPES.catalogRead)) {
    server.registerTool(
      "list_stores",
      {
        title: "List stores",
        description: "List the stores (catalogs) this connection may use, with ids, slugs, public links and what this connection may change.",
        annotations: readOnly,
        scopeChallenge: requireScopes(SCOPES.catalogRead),
      },
      async (ctx) =>
        run("list_stores", ctx, async (access) =>
          (await listAccessibleStores(access)).map((s) => ({
            ...storeSummary(s),
            canEditCatalog: can(SCOPES.catalogWrite),
            canUpdateQuotes: can(SCOPES.quotesWrite),
          })),
        ),
    );

    server.registerTool(
      "get_catalog",
      {
        title: "Get catalog",
        description:
          "Get a store's categories with their sections and a short summary of every item (including hidden ones), with ids. Pass categoryId to get just one category.",
        inputSchema: z.object({ store: storeArg, categoryId: idArg("category").optional() }),
        annotations: readOnly,
        scopeChallenge: requireScopes(SCOPES.catalogRead),
      },
      async ({ store, categoryId }, ctx) => run("get_catalog", ctx, async (access) => getCatalog(await resolveStore(access, store), categoryId)),
    );

    server.registerTool(
      "get_item",
      {
        title: "Get item",
        description: "Get one item's full details: description, specs, variants, unit, price, photos and visibility.",
        inputSchema: z.object({ store: storeArg, itemId: idArg("item") }),
        annotations: readOnly,
        scopeChallenge: requireScopes(SCOPES.catalogRead),
      },
      async ({ store, itemId }, ctx) => run("get_item", ctx, async (access) => getItemDetail(await resolveStore(access, store), itemId)),
    );
  }

  // ---------- catalog: write ----------
  if (can(SCOPES.catalogWrite)) {
    server.registerTool(
      "create_category",
      {
        title: "Create category",
        description: 'Create a category (a page of the catalog, e.g. "Paver Moulds"). It starts hidden; publish it with set_visibility when the owner asks.',
        inputSchema: z.object({
          store: storeArg,
          name: z.string().trim().min(1).max(80),
          description: z.string().trim().max(1000).optional(),
        }),
        annotations: additive,
        scopeChallenge: requireScopes(SCOPES.catalogWrite),
      },
      async ({ store, ...input }, ctx) => run("create_category", ctx, async (access) => createCategory(await resolveStore(access, store), input)),
    );

    server.registerTool(
      "update_category",
      {
        title: "Update category",
        description: "Rename a category or replace its description.",
        inputSchema: z.object({
          store: storeArg,
          categoryId: idArg("category"),
          name: z.string().trim().min(1).max(80).optional(),
          description: z.string().trim().max(1000).optional(),
        }),
        annotations: overwrite,
        scopeChallenge: requireScopes(SCOPES.catalogWrite),
      },
      async ({ store, categoryId, ...patch }, ctx) =>
        run("update_category", ctx, async (access) => updateCategory(await resolveStore(access, store), categoryId, patch)),
    );

    server.registerTool(
      "add_section",
      {
        title: "Add section",
        description: 'Add a section (a block on a category page, e.g. "Pillars"). Returns the existing section if one with that name already exists.',
        inputSchema: z.object({ store: storeArg, categoryId: idArg("category"), name: z.string().trim().min(1).max(80) }),
        annotations: { ...additive, idempotentHint: true },
        scopeChallenge: requireScopes(SCOPES.catalogWrite),
      },
      async ({ store, categoryId, name }, ctx) => run("add_section", ctx, async (access) => addSection(await resolveStore(access, store), categoryId, name)),
    );

    server.registerTool(
      "create_item",
      {
        title: "Create item",
        description:
          "Add a product to a category (and optionally a section). It starts hidden; publish it with set_visibility when the owner asks. Photos are added by the owner in the dashboard.",
        inputSchema: z.object({
          store: storeArg,
          categoryId: idArg("category"),
          sectionId: idArg("section").optional().describe("Section id from get_catalog; omit for no section"),
          name: z.string().trim().min(1).max(120),
          code: z.string().trim().max(60).optional().describe('Model code, e.g. "WP 801"'),
          description: z.string().trim().max(3000).optional(),
          specs: z.array(specArg).max(40).optional(),
          variants: z.array(variantArg).max(10).optional(),
          unit: z.string().trim().min(1).max(20).optional().describe('Unit for quantities, e.g. "pcs" (default) or "sets"'),
          price: z.number().min(0).optional().describe("Optional price in the store currency; only shown if the store turns prices on"),
        }),
        annotations: additive,
        scopeChallenge: requireScopes(SCOPES.catalogWrite),
      },
      async ({ store, ...input }, ctx) => run("create_item", ctx, async (access) => createItem(await resolveStore(access, store), input)),
    );

    server.registerTool(
      "update_item",
      {
        title: "Update item",
        description:
          "Change an item's details or move it to another category/section. Only the fields you pass change; specs and variants are replaced as a whole.",
        inputSchema: z.object({
          store: storeArg,
          itemId: idArg("item"),
          categoryId: idArg("category").optional().describe("Move to this category (its section is cleared unless sectionId is given)"),
          sectionId: idArg("section").nullable().optional().describe("Section id, or null to take it out of its section"),
          name: z.string().trim().min(1).max(120).optional(),
          code: z.string().trim().max(60).optional(),
          description: z.string().trim().max(3000).optional(),
          specs: z.array(specArg).max(40).optional(),
          variants: z.array(variantArg).max(10).optional(),
          unit: z.string().trim().min(1).max(20).optional(),
          price: z.number().min(0).nullable().optional().describe("Price, or null to remove it"),
        }),
        annotations: overwrite,
        scopeChallenge: requireScopes(SCOPES.catalogWrite),
      },
      async ({ store, itemId, ...patch }, ctx) => run("update_item", ctx, async (access) => updateItem(await resolveStore(access, store), itemId, patch)),
    );

    server.registerTool(
      "set_visibility",
      {
        title: "Publish or hide",
        description:
          "Publish (visible=true) or hide (visible=false) an item or a whole category on the public catalog. An item is public only when its category is visible too. Only publish when the owner asked; ask before hiding something that is live.",
        inputSchema: z.object({ store: storeArg, kind: z.enum(["item", "category"]), id: idArg("item or category"), visible: z.boolean() }),
        annotations: publish,
        scopeChallenge: requireScopes(SCOPES.catalogWrite),
      },
      async ({ store, kind, id, visible }, ctx) =>
        run("set_visibility", ctx, async (access) => setVisibility(await resolveStore(access, store), kind, id, visible)),
    );
  }

  // ---------- quotes ----------
  if (can(SCOPES.quotesRead)) {
    server.registerTool(
      "list_quotes",
      {
        title: "List quote requests",
        description: "List a store's quote requests, newest first, optionally filtered by status.",
        inputSchema: z.object({ store: storeArg, status: statusArg.optional(), limit: z.number().int().min(1).max(50).optional().describe("Default 20") }),
        annotations: readOnly,
        scopeChallenge: requireScopes(SCOPES.quotesRead),
      },
      async ({ store, status, limit }, ctx) => run("list_quotes", ctx, async (access) => listQuotes(await resolveStore(access, store), status, limit ?? 20)),
    );

    server.registerTool(
      "get_quote",
      {
        title: "Get quote request",
        description: "Get one quote request with its items, options, quantities and buyer details.",
        inputSchema: z.object({ store: storeArg, quote: quoteArg }),
        annotations: readOnly,
        scopeChallenge: requireScopes(SCOPES.quotesRead),
      },
      async ({ store, quote }, ctx) => run("get_quote", ctx, async (access) => getQuote(await resolveStore(access, store), quote)),
    );
  }

  if (can(SCOPES.quotesWrite)) {
    server.registerTool(
      "update_quote_status",
      {
        title: "Update quote status",
        description: "Set a quote request's status to new, contacted or closed.",
        inputSchema: z.object({ store: storeArg, quote: quoteArg, status: statusArg }),
        annotations: overwrite,
        scopeChallenge: requireScopes(SCOPES.quotesWrite),
      },
      async ({ store, quote, status }, ctx) =>
        run("update_quote_status", ctx, async (access) => updateQuoteStatus(await resolveStore(access, store), quote, status)),
    );
  }

  return server;
}
