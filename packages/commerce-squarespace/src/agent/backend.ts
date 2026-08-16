import { CommerceApiError } from "@corte-so/commerce-core";
import type {
  AgentCollection,
  AgentProductDetail,
  AgentProductSummary,
  CommerceAgentBackend,
  ListOrdersArgs,
  ListProductsArgs,
  UpdateProductChanges,
} from "@corte-so/commerce-agent-tools";
import {
  getProductById,
  listAllProducts,
  listVisibleProducts,
  tagGroups,
} from "../catalog.js";
import {
  MAX_ORDER_PAGES,
  ORDERS_PATH,
  PRODUCTS_V2_PATH,
  PROVIDER_ID,
} from "../constants.js";
import { mapProduct } from "../mappers.js";
import { sortProducts } from "../sorting.js";
import type { SquarespaceProduct } from "../types.js";
import type { SquarespaceAgentClient } from "./client.js";
import { toAgentDetail, toAgentOrder, toAgentSummary } from "./mappers.js";
import type {
  SquarespaceOrder,
  SquarespaceOrdersResponse,
  SquarespaceProductUpdateBody,
} from "./types.js";

/** `status` as the suite states it → the Orders API's `fulfillmentStatus`. */
const FULFILLMENT_STATUS: Record<ListOrdersArgs["status"], string | undefined> = {
  any: undefined,
  open: "PENDING",
  completed: "FULFILLED",
  canceled: "CANCELED",
};

function change<T>(value: T): { present: true; value: T } {
  return { present: true, value };
}

/**
 * The agent half of the Squarespace provider, over the same official Commerce
 * API and the same API key as the catalog side. Products and collections reuse
 * the catalog reads; orders come from the Orders API, which — unlike carts and
 * checkouts — Squarespace does document, so `list_orders` exists here even
 * though the storefront provider is browse-only.
 */
export function createSquarespaceAgentBackend(
  client: SquarespaceAgentClient,
): CommerceAgentBackend {
  const storeOrigin = client.storeOrigin;
  const toProduct = (product: SquarespaceProduct) =>
    mapProduct(product, storeOrigin);

  /**
   * Orders, newest-modified first. The documented cursor rule is that a
   * request carries *either* a cursor or filters, never both, so filters go on
   * the first request only and the cursor carries them forward.
   */
  const listOrderPages = async (
    fulfillmentStatus: string | undefined,
    limit: number,
  ): Promise<SquarespaceOrder[]> => {
    const orders: SquarespaceOrder[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;

    for (let page = 0; page < MAX_ORDER_PAGES; page++) {
      const query: Record<string, string> | undefined = cursor
        ? { cursor }
        : fulfillmentStatus
          ? { fulfillmentStatus }
          : undefined;
      const data = await client.get<SquarespaceOrdersResponse>(
        ORDERS_PATH,
        query,
      );
      orders.push(...(data.result ?? []));
      if (orders.length >= limit) break;

      const pagination = data.pagination;
      if (pagination?.hasNextPage === false) break;
      const next = pagination?.nextPageCursor?.trim();
      if (!next || seenCursors.has(next)) break;
      seenCursors.add(next);
      cursor = next;
    }

    return orders;
  };

  const readProduct = async (id: string): Promise<AgentProductDetail | null> => {
    const product = await getProductById(client, id);
    return product ? toAgentDetail(toProduct(product)) : null;
  };

  return {
    providerId: PROVIDER_ID,

    /**
     * The whole catalog, including products the storefront hides: this is a
     * merchant-side tool, and an agent asked why a product isn't showing has
     * to be able to see it. Query and sort are client-side for the same reason
     * the storefront's are — the Products API offers neither.
     */
    async listProducts({
      query,
      sortKey,
      reverse,
      limit,
    }: ListProductsArgs): Promise<AgentProductSummary[]> {
      let products = await listAllProducts(client);

      const needle = query?.trim().toLowerCase();
      if (needle) {
        products = products.filter((product) =>
          product.name.toLowerCase().includes(needle),
        );
      }

      return sortProducts(products, sortKey, reverse)
        .slice(0, limit)
        .map((product) => toAgentSummary(toProduct(product)));
    },

    /** Squarespace has no storefront handle, so the id is the handle. */
    getProduct: readProduct,

    /**
     * The same tag-derived pseudo-collections the storefront shows — derived
     * from the visible catalog, because these are storefront navigation
     * entries and a tag carried only by hidden products isn't one.
     */
    async listCollections(): Promise<AgentCollection[]> {
      const products = await listVisibleProducts(client);
      return tagGroups(products).map((group) => ({
        handle: group.tag,
        title: group.tag,
        description: group.tag,
        path: `/search/${encodeURIComponent(group.tag)}`,
        productCount: group.productCount,
      }));
    },

    /**
     * Products API v2's documented update endpoint, which takes each field
     * wrapped in a `{ present, value }` change. `seo` is read-modify-write:
     * the endpoint replaces the whole SEO object, so a change to just the
     * title would otherwise blank the description.
     */
    async updateProduct(
      id: string,
      changes: UpdateProductChanges,
    ): Promise<AgentProductDetail> {
      const current = await getProductById(client, id);
      if (!current) {
        throw new CommerceApiError(PROVIDER_ID, 404, `Unknown product: ${id}`);
      }

      const body: SquarespaceProductUpdateBody = {
        ...(changes.title !== undefined ? { name: change(changes.title) } : {}),
        ...(changes.description !== undefined
          ? { description: change(changes.description) }
          : {}),
        ...(changes.tags !== undefined ? { tags: change(changes.tags) } : {}),
        ...(changes.visible !== undefined
          ? { isVisible: change(changes.visible) }
          : {}),
        ...(changes.seo !== undefined
          ? {
              seoData: change({
                title: changes.seo.title ?? current.seoOptions?.title ?? "",
                description:
                  changes.seo.description ?? current.seoOptions?.description ?? "",
              }),
            }
          : {}),
      };

      if (Object.keys(body).length > 0) {
        await client.post(
          `${PRODUCTS_V2_PATH}/${encodeURIComponent(id.trim())}`,
          body,
        );
      }

      // Re-read on 1.0 so the returned detail is mapped by exactly the same
      // path as `get_product`, rather than from the v2 response's own shape.
      const updated = await readProduct(id);
      if (!updated) {
        throw new CommerceApiError(
          PROVIDER_ID,
          404,
          `Product ${id} could not be read back after the update`,
        );
      }
      return updated;
    },

    async listOrders({ limit, status }: ListOrdersArgs) {
      const orders = await listOrderPages(FULFILLMENT_STATUS[status], limit);
      return orders.slice(0, limit).map(toAgentOrder);
    },
  };
}
