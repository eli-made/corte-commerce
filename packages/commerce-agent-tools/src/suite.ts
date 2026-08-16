import { z } from "zod";
import { CommerceError } from "@corte-so/commerce-core";
import type { CommerceAgentBackend } from "./backend.js";

/**
 * A generated agent tool. `inputSchema` is plain JSON Schema (draft 2020-12,
 * emitted from the zod schema the handler validates with, so the two cannot
 * drift) — hand it to MCP, the AI SDK, or any tool-calling runtime as-is.
 * `execute` validates its input itself; hosts may layer their own checks.
 *
 * `verb` is the unprefixed name — hosts compose the final tool name
 * (`shopify_list_products`) so naming policy stays with the host.
 */
export type AgentToolSpec = {
  verb: string;
  title: string;
  description: string;
  access: "read" | "write";
  inputSchema: Record<string, unknown>;
  execute(raw: unknown): Promise<unknown>;
};

const sortKey = z
  .enum(["relevance", "best-selling", "created-at", "price"])
  .describe("Provider-neutral sort key.");

const listProductsInput = z.object({
  query: z.string().optional().describe("Free-text product search."),
  sortKey: sortKey.optional(),
  reverse: z.boolean().optional().describe("Reverse the sort order."),
  limit: z.number().int().min(1).max(50).default(20),
});

const getProductInput = z.object({
  id: z.string().describe("Product id or storefront handle."),
});

const listCollectionsInput = z.object({});

const updateProductInput = z.object({
  id: z.string().describe("Product id."),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  tags: z
    .array(z.string())
    .optional()
    .describe("Replaces the full tag list — include existing tags to keep them."),
  visible: z
    .boolean()
    .optional()
    .describe("Whether the product is visible on the storefront."),
  seo: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
    })
    .optional(),
});

const listOrdersInput = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  status: z.enum(["any", "open", "completed", "canceled"]).default("any"),
});

function parseOrExplain<T extends z.ZodType>(
  schema: T,
  raw: unknown,
  verb: string,
): z.output<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new CommerceError(
      `Invalid input for ${verb}: ${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

/**
 * Generate the agent tool suite for a backend. Tools whose backend method is
 * absent are omitted entirely — a provider without an orders API produces no
 * orders tool, rather than a tool that apologizes at runtime.
 */
export function createCommerceAgentTools(
  backend: CommerceAgentBackend,
): AgentToolSpec[] {
  const tools: AgentToolSpec[] = [
    {
      verb: "list_products",
      title: "List products",
      description:
        "List products from the connected store, optionally filtered by a free-text query and sorted. Returns product summaries (id, handle, title, price range, tags, availability).",
      access: "read",
      inputSchema: z.toJSONSchema(listProductsInput),
      execute: async (raw) =>
        backend.listProducts(
          parseOrExplain(listProductsInput, raw, "list_products"),
        ),
    },
    {
      verb: "get_product",
      title: "Get product",
      description:
        "Fetch one product in full detail (description, options, variants with prices, images, SEO) by id or handle. Returns null if not found.",
      access: "read",
      inputSchema: z.toJSONSchema(getProductInput),
      execute: async (raw) =>
        backend.getProduct(
          parseOrExplain(getProductInput, raw, "get_product").id,
        ),
    },
  ];

  if (backend.listCollections) {
    tools.push({
      verb: "list_collections",
      title: "List collections",
      description:
        "List the store's product collections (or categories), with titles and storefront paths.",
      access: "read",
      inputSchema: z.toJSONSchema(listCollectionsInput),
      execute: async (raw) => {
        parseOrExplain(listCollectionsInput, raw ?? {}, "list_collections");
        return backend.listCollections!();
      },
    });
  }

  if (backend.updateProduct) {
    tools.push({
      verb: "update_product",
      title: "Update product",
      description:
        "Update a product's title, description, tags, visibility, or SEO fields. Only the fields provided are changed; `tags` replaces the whole list. Returns the updated product.",
      access: "write",
      inputSchema: z.toJSONSchema(updateProductInput),
      execute: async (raw) => {
        const { id, ...changes } = parseOrExplain(
          updateProductInput,
          raw,
          "update_product",
        );
        return backend.updateProduct!(id, changes);
      },
    });
  }

  if (backend.listOrders) {
    tools.push({
      verb: "list_orders",
      title: "List orders",
      description:
        "List recent orders with status, totals, customer, and a line-item summary. Read-only.",
      access: "read",
      inputSchema: z.toJSONSchema(listOrdersInput),
      execute: async (raw) =>
        backend.listOrders!(
          parseOrExplain(listOrdersInput, raw ?? {}, "list_orders"),
        ),
    });
  }

  return tools;
}
