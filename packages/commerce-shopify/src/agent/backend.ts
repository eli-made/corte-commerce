import { CommerceApiError, type ProductSortKey } from "@corte-so/commerce-core";
import type {
  AgentCollection,
  AgentOrderSummary,
  AgentProductDetail,
  AgentProductSummary,
  CommerceAgentBackend,
  ListOrdersArgs,
  ListProductsArgs,
  UpdateProductChanges,
} from "@corte-so/commerce-agent-tools";
import type { ShopifyAdminClient } from "./client.js";
import {
  reshapeAgentCollection,
  reshapeAgentOrder,
  reshapeAgentProductDetail,
  reshapeAgentProductSummary,
} from "./mappers.js";
import {
  findProductByHandleQuery,
  findProductIdByHandleQuery,
  getProductQuery,
  listCollectionsQuery,
  listOrdersQuery,
  listProductsQuery,
  updateProductMutation,
} from "./queries.js";
import type {
  AdminFindProductData,
  AdminFindProductIdData,
  AdminGetProductData,
  AdminListCollectionsData,
  AdminListOrdersData,
  AdminListProductsData,
  AdminUpdateProductData,
} from "./types.js";

const PROVIDER_ID = "shopify";

/** Collections are a navigation-sized list; one page is the whole answer for
 * all but the largest catalogs. */
const COLLECTION_LIMIT = 50;

/** Line items fetched per order to build `lineSummary`/`lineCount`. */
const ORDER_LINE_ITEM_LIMIT = 10;

/**
 * Neutral sort keys onto Admin's `ProductSortKeys`, which is a different enum
 * from the Storefront's: it has neither `BEST_SELLING` nor `PRICE`, and
 * Shopify documents `RELEVANCE` as meaningless without a search query.
 *
 * Unsupported keys are *omitted* rather than substituted — Shopify then
 * applies its own default ordering, which is honest, where sorting by an
 * unrelated field (title, inventory) would quietly answer a different
 * question. Callers who need price order can sort the returned page.
 */
export function toAdminProductSortKey(
  sortKey: ProductSortKey | undefined,
  hasQuery: boolean,
): string | undefined {
  switch (sortKey) {
    case "created-at":
      return "CREATED_AT";
    case "relevance":
      return hasQuery ? "RELEVANCE" : undefined;
    case "best-selling":
    case "price":
    default:
      return undefined;
  }
}

/**
 * Suite order statuses onto Shopify's order search vocabulary. Shopify's
 * "closed" means *archived* — the merchant's own "this one is done" marker —
 * so a fulfilled order that nobody archived is still `open`. Each returned
 * summary carries the financial/fulfillment state in `status`, so an agent can
 * narrow further from what it got back.
 */
export function toAdminOrderQuery(
  status: ListOrdersArgs["status"],
): string | undefined {
  switch (status) {
    case "open":
      return "status:open";
    case "completed":
      return "status:closed";
    case "canceled":
      return "status:cancelled";
    case "any":
    default:
      return undefined;
  }
}

function isGid(value: string): boolean {
  return value.startsWith("gid://");
}

/** Admin ids are gids; the numeric form is what merchants see in admin URLs. */
function toProductGid(idOrHandle: string): string | undefined {
  if (isGid(idOrHandle)) return idOrHandle;
  if (/^\d+$/.test(idOrHandle)) return `gid://shopify/Product/${idOrHandle}`;
  return undefined;
}

/** Shopify search syntax: quote the value and escape quotes/backslashes so a
 * handle can never break out into extra query terms. */
function handleQuery(handle: string): string {
  const escaped = handle.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `handle:"${escaped}"`;
}

/**
 * Build the agent backend for a store. Closes over the Admin client, so no
 * credential ever appears in a tool argument or a result.
 *
 * All five methods are implemented: Shopify's Admin API supports the whole
 * suite, so an agent connected to Shopify gets every tool.
 */
export function createShopifyAgentBackend(
  client: ShopifyAdminClient,
): CommerceAgentBackend {
  const { storeUrl } = client;

  async function findDetailByHandle(
    handle: string,
  ): Promise<AgentProductDetail | null> {
    const data = await client.graphql<AdminFindProductData>(
      findProductByHandleQuery,
      { query: handleQuery(handle) },
    );
    const product = data.products?.nodes?.[0];
    // A `handle:` search matches only exact handles, but guard anyway so a
    // near-miss can never be returned as the requested product.
    if (!product || product.handle !== handle) return null;
    return reshapeAgentProductDetail(product, storeUrl);
  }

  async function resolveProductGid(idOrHandle: string): Promise<string> {
    const gid = toProductGid(idOrHandle);
    if (gid) return gid;

    const data = await client.graphql<AdminFindProductIdData>(
      findProductIdByHandleQuery,
      { query: handleQuery(idOrHandle) },
    );
    const id = data.products?.nodes?.[0]?.id;
    if (!id) {
      throw new CommerceApiError(
        PROVIDER_ID,
        404,
        `No product found for "${idOrHandle}"`,
      );
    }
    return id;
  }

  return {
    providerId: PROVIDER_ID,

    async listProducts(args: ListProductsArgs): Promise<AgentProductSummary[]> {
      const data = await client.graphql<AdminListProductsData>(
        listProductsQuery,
        {
          first: args.limit,
          query: args.query,
          sortKey: toAdminProductSortKey(args.sortKey, Boolean(args.query)),
          reverse: args.reverse,
        },
      );
      return (data.products?.nodes ?? []).map((product) =>
        reshapeAgentProductSummary(product, storeUrl),
      );
    },

    async getProduct(idOrHandle: string): Promise<AgentProductDetail | null> {
      const gid = toProductGid(idOrHandle);
      if (!gid) return findDetailByHandle(idOrHandle);

      const data = await client.graphql<AdminGetProductData>(getProductQuery, {
        id: gid,
      });
      // Admin returns a null product for ids that are unknown or deleted.
      return data.product ? reshapeAgentProductDetail(data.product, storeUrl) : null;
    },

    async listCollections(): Promise<AgentCollection[]> {
      const data = await client.graphql<AdminListCollectionsData>(
        listCollectionsQuery,
        { first: COLLECTION_LIMIT },
      );
      return (data.collections?.nodes ?? []).map(reshapeAgentCollection);
    },

    async updateProduct(
      id: string,
      changes: UpdateProductChanges,
    ): Promise<AgentProductDetail> {
      const product: Record<string, unknown> = {
        id: await resolveProductGid(id),
      };

      if (changes.title !== undefined) product.title = changes.title;
      // Shopify stores one description, as HTML. Plain text sent here is
      // accepted verbatim; `product.description` is the tag-stripped read side.
      if (changes.description !== undefined) {
        product.descriptionHtml = changes.description;
      }
      // `tags` replaces the whole list, which is what the suite documents.
      if (changes.tags !== undefined) product.tags = changes.tags;
      // Visibility is product status: DRAFT keeps the product but unpublishes
      // it. ARCHIVED is deliberately not reachable — it is not "hidden", and
      // undoing it is not the inverse of this call.
      if (changes.visible !== undefined) {
        product.status = changes.visible ? "ACTIVE" : "DRAFT";
      }
      if (changes.seo !== undefined) {
        const seo: Record<string, unknown> = {};
        if (changes.seo.title !== undefined) seo.title = changes.seo.title;
        if (changes.seo.description !== undefined) {
          seo.description = changes.seo.description;
        }
        if (Object.keys(seo).length > 0) product.seo = seo;
      }

      const data = await client.graphql<AdminUpdateProductData>(
        updateProductMutation,
        { product },
      );

      // Admin mutations report validation failures inside a 200 response.
      const userErrors = data.productUpdate?.userErrors ?? [];
      if (userErrors.length > 0) {
        throw new CommerceApiError(
          PROVIDER_ID,
          422,
          `productUpdate failed: ${userErrors
            .map((error) => error.message)
            .join("; ")}`,
        );
      }

      const updated = data.productUpdate?.product;
      if (!updated) {
        throw new CommerceApiError(
          PROVIDER_ID,
          422,
          "productUpdate returned no product",
        );
      }
      return reshapeAgentProductDetail(updated, storeUrl);
    },

    async listOrders(args: ListOrdersArgs): Promise<AgentOrderSummary[]> {
      const data = await client.graphql<AdminListOrdersData>(listOrdersQuery, {
        first: args.limit,
        query: toAdminOrderQuery(args.status),
        lineItems: ORDER_LINE_ITEM_LIMIT,
      });
      return (data.orders?.nodes ?? []).map(reshapeAgentOrder);
    },
  };
}
