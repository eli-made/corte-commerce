import { CommerceApiError, CommerceError } from "@corte-so/commerce-core";
import type { ProductSortKey } from "@corte-so/commerce-core";
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

import { PROVIDER_ID } from "../fetch.js";
import { slugFromPath } from "../mappers.js";
import type { BigCommerceAdminClient } from "./client.js";
import {
  tagsToSearchKeywords,
  toAgentCollection,
  toAgentOrderSummary,
  toAgentProductDetail,
  toAgentProductSummary,
  type ProductMapOptions,
} from "./mappers.js";
import type {
  BigCommerceRestCategory,
  BigCommerceRestOrder,
  BigCommerceRestProduct,
  V3Envelope,
} from "./types.js";

/** Sub-resources the summary mapping needs. */
const LIST_INCLUDE = "variants,images";
/** …plus options, which only the detail shape reports. */
const DETAIL_INCLUDE = "variants,images,options";

/** Categories have no cursor in the agent contract; one page is reported. */
const COLLECTION_PAGE_SIZE = 50;

/** v2 `status_id`s that are not "open" work: nothing left for the merchant to
 * do, or never became an order at all. */
const CLOSED_ORDER_STATUS_IDS = new Set([
  0, // Incomplete
  4, // Refunded
  5, // Cancelled
  6, // Declined
  10, // Completed
]);
const COMPLETED_STATUS_ID = 10;
const CANCELLED_STATUS_ID = 5;

/** v2's own page cap, used when "open" has to be filtered client-side. */
const ORDER_FETCH_CAP = 250;

export type CatalogSort = { sort: string; direction: "asc" | "desc" };

/**
 * Core's neutral sort keys mapped onto `/v3/catalog/products`.
 *
 * Each key has a natural base direction and `reverse` flips it: price ascends
 * by default (cheapest first), `created-at` ascends (so `reverse: true` — how
 * core's "Latest arrivals" option is defined — reads newest first), and
 * `best-selling` descends (most sold first, matching `reverse: false` on core's
 * "Trending"). `relevance` has no v3 equivalent, so no `sort` is sent and
 * BigCommerce's own ordering stands — which, with a `keyword`, is its relevance
 * ranking.
 */
export const toCatalogSort = (
  sortKey: ProductSortKey | undefined,
  reverse = false,
): CatalogSort | null => {
  switch (sortKey) {
    case "created-at":
      return { sort: "date_created", direction: reverse ? "desc" : "asc" };
    case "price":
      return { sort: "price", direction: reverse ? "desc" : "asc" };
    case "best-selling":
      return { sort: "total_sold", direction: reverse ? "asc" : "desc" };
    default:
      return null;
  }
};

const isNumericId = (value: string): boolean => /^\d+$/.test(value.trim());

/**
 * Agent backend over BigCommerce's store management REST APIs: v3 for the
 * catalog (products, categories) and v2 for orders, which is the only version
 * that has them. All five backend methods are implemented, so the generated
 * tool suite is complete.
 */
export function createBigCommerceAgentBackend(
  client: BigCommerceAdminClient,
): CommerceAgentBackend {
  const mapOptions: ProductMapOptions = {
    currencyCode: client.currencyCode,
    storefrontUrl: client.storefrontUrl,
  };

  const getProduct = async (
    idOrHandle: string,
  ): Promise<AgentProductDetail | null> => {
    const identifier = idOrHandle.trim();

    if (isNumericId(identifier)) {
      const response = await client.requestOrNull<
        V3Envelope<BigCommerceRestProduct>
      >(`/v3/catalog/products/${identifier}`, {
        query: { include: DETAIL_INCLUDE },
      });

      return response?.data
        ? toAgentProductDetail(response.data, mapOptions)
        : null;
    }

    // Handles are storefront slugs, which v3 cannot filter on. Best effort:
    // search the slug as free text (hyphens read as word breaks) and keep only
    // an exact slug match, so a near miss reports nothing rather than the
    // wrong product.
    const slug = slugFromPath(identifier);
    const response = await client.request<V3Envelope<BigCommerceRestProduct[]>>(
      "/v3/catalog/products",
      {
        query: {
          include: DETAIL_INCLUDE,
          keyword: slug.replace(/-/g, " "),
          limit: COLLECTION_PAGE_SIZE,
        },
      },
    );

    const match = (response.data ?? []).find(
      (product) => slugFromPath(product.custom_url?.url) === slug,
    );

    return match ? toAgentProductDetail(match, mapOptions) : null;
  };

  return {
    providerId: PROVIDER_ID,

    async listProducts(args: ListProductsArgs): Promise<AgentProductSummary[]> {
      const sort = toCatalogSort(args.sortKey, args.reverse);

      const response = await client.request<
        V3Envelope<BigCommerceRestProduct[]>
      >("/v3/catalog/products", {
        query: {
          include: LIST_INCLUDE,
          limit: args.limit,
          ...(args.query ? { keyword: args.query } : {}),
          ...(sort ? { sort: sort.sort, direction: sort.direction } : {}),
        },
      });

      return (response.data ?? []).map((product) =>
        toAgentProductSummary(product, mapOptions),
      );
    },

    getProduct,

    async listCollections(): Promise<AgentCollection[]> {
      const response = await client.request<
        V3Envelope<BigCommerceRestCategory[]>
      >("/v3/catalog/categories", {
        query: { limit: COLLECTION_PAGE_SIZE },
      });

      return (response.data ?? []).map(toAgentCollection);
    },

    async updateProduct(
      id: string,
      changes: UpdateProductChanges,
    ): Promise<AgentProductDetail> {
      if (!isNumericId(id)) {
        throw new CommerceError(
          `[${PROVIDER_ID}] Unusable product id "${id}" — updates address a numeric BigCommerce product id, not a handle`,
        );
      }

      const productId = id.trim();
      const body: Record<string, unknown> = {};

      if (changes.title !== undefined) body.name = changes.title;
      if (changes.description !== undefined) {
        body.description = changes.description;
      }
      if (changes.visible !== undefined) body.is_visible = changes.visible;
      // Tags are the merchandising keyword list; see `toTags` for why this is
      // not the same field the catalog provider reads tags from.
      if (changes.tags !== undefined) {
        body.search_keywords = tagsToSearchKeywords(changes.tags);
      }
      if (changes.seo?.title !== undefined) body.page_title = changes.seo.title;
      if (changes.seo?.description !== undefined) {
        body.meta_description = changes.seo.description;
      }

      // An update naming no fields is a read: nothing is written.
      if (Object.keys(body).length > 0) {
        await client.request(`/v3/catalog/products/${productId}`, {
          method: "PUT",
          body,
        });
      }

      // The PUT echoes the product without the sub-resources the detail shape
      // needs, so the result is read back in full.
      const refreshed = await getProduct(productId);

      if (!refreshed) {
        throw new CommerceApiError(
          PROVIDER_ID,
          404,
          `Product ${productId} could not be read back after the update`,
        );
      }

      return refreshed;
    },

    async listOrders(args: ListOrdersArgs): Promise<AgentOrderSummary[]> {
      const statusId =
        args.status === "completed"
          ? COMPLETED_STATUS_ID
          : args.status === "canceled"
            ? CANCELLED_STATUS_ID
            : undefined;

      // "open" spans several v2 statuses and v2 filters on one at a time, so it
      // is resolved client-side over a wider page.
      const isOpen = args.status === "open";
      const limit = isOpen
        ? Math.min(ORDER_FETCH_CAP, args.limit * 3)
        : args.limit;

      const orders =
        (await client.requestOrNull<BigCommerceRestOrder[]>("/v2/orders", {
          query: {
            limit,
            sort: "date_created:desc",
            ...(statusId === undefined ? {} : { status_id: statusId }),
          },
        })) ?? [];

      const selected = isOpen
        ? orders.filter(
            (order) => !CLOSED_ORDER_STATUS_IDS.has(order.status_id ?? -1),
          )
        : orders;

      return selected.slice(0, args.limit).map(toAgentOrderSummary);
    },
  };
}
