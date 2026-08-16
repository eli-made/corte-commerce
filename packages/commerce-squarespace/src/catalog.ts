import { HIDDEN_PRODUCT_TAG } from "@corte-so/commerce-core";
import { MAX_PRODUCT_PAGES, PRODUCTS_PATH } from "./constants.js";
import type { SquarespaceClient } from "./fetch.js";
import type { SquarespaceProduct, SquarespaceProductsResponse } from "./types.js";

// The catalog reads shared by the storefront provider and the agent backend:
// one cursor walk, one hidden-product rule, one tag-grouping rule, so the two
// surfaces can never drift into showing different catalogs.

/**
 * Walk the catalog, following `pagination.nextPageCursor` until the API says
 * there is no next page. Stops after MAX_PRODUCT_PAGES pages, or if the API
 * hands back a cursor it already gave us, so a misbehaving cursor cannot
 * spin forever.
 */
export async function listAllProducts(
  client: SquarespaceClient,
): Promise<SquarespaceProduct[]> {
  const products: SquarespaceProduct[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PRODUCT_PAGES; page++) {
    const data = await client.get<SquarespaceProductsResponse>(
      PRODUCTS_PATH,
      cursor ? { cursor } : undefined,
    );
    products.push(...(data.products ?? []));

    const pagination = data.pagination;
    if (pagination?.hasNextPage === false) break;
    const next = pagination?.nextPageCursor?.trim();
    if (!next || seenCursors.has(next)) break;
    seenCursors.add(next);
    cursor = next;
  }

  return products;
}

/** The catalog as a storefront should see it: hidden products removed. */
export async function listVisibleProducts(
  client: SquarespaceClient,
): Promise<SquarespaceProduct[]> {
  const products = await listAllProducts(client);
  return products.filter(
    (product) => !(product.tags ?? []).includes(HIDDEN_PRODUCT_TAG),
  );
}

/** One product by id, or `null` when the API reports it does not exist. */
export async function getProductById(
  client: SquarespaceClient,
  id: string,
): Promise<SquarespaceProduct | null> {
  const trimmed = id?.trim();
  if (!trimmed) return null;
  const data = await client.getOrNull<SquarespaceProductsResponse>(
    `${PRODUCTS_PATH}/${encodeURIComponent(trimmed)}`,
  );
  return data?.products?.[0] ?? null;
}

export function isHiddenTag(tag: string): boolean {
  return tag.toLowerCase().startsWith("hidden");
}

/** A tag standing in for a collection, with the products carrying it. */
export type TagGroup = {
  tag: string;
  /** `modifiedOn` of the product that introduced the tag. */
  updatedAt: string;
  productCount: number;
};

/**
 * Group a catalog by tag, in first-seen order. Tags beginning with `hidden`
 * are skipped — they are the merchant's own bookkeeping, not navigation.
 */
export function tagGroups(products: SquarespaceProduct[]): TagGroup[] {
  const groups = new Map<string, TagGroup>();

  for (const product of products) {
    const updatedAt = product.modifiedOn ?? product.createdOn ?? "";
    for (const tag of product.tags ?? []) {
      if (isHiddenTag(tag)) continue;
      const existing = groups.get(tag);
      if (existing) {
        existing.productCount += 1;
        continue;
      }
      groups.set(tag, { tag, updatedAt, productCount: 1 });
    }
  }

  return [...groups.values()];
}

/** Absolute origin for the merchant's storefront, or `undefined` if unusable. */
export function normalizeStoreDomain(storeDomain?: string): string | undefined {
  const trimmed = storeDomain?.trim();
  if (!trimmed) return undefined;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).href.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}
