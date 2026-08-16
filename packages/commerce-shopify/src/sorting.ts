import type { ProductSortKey, SortOption } from "@corte-so/commerce-core";

/** `ProductSortKeys` — used by `products(...)`. */
const PRODUCT_SORT_KEYS: Record<ProductSortKey, string> = {
  relevance: "RELEVANCE",
  "best-selling": "BEST_SELLING",
  "created-at": "CREATED_AT",
  price: "PRICE",
};

/** `ProductCollectionSortKeys` — the collection enum spells creation date
 * `CREATED`, not `CREATED_AT`. */
const COLLECTION_SORT_KEYS: Record<ProductSortKey, string> = {
  ...PRODUCT_SORT_KEYS,
  "created-at": "CREATED",
};

export function toProductSortKey(sortKey?: ProductSortKey): string | undefined {
  return sortKey ? PRODUCT_SORT_KEYS[sortKey] : undefined;
}

export function toCollectionSortKey(sortKey?: ProductSortKey): string | undefined {
  return sortKey ? COLLECTION_SORT_KEYS[sortKey] : undefined;
}

export const defaultSort: SortOption = {
  title: "Relevance",
  slug: null,
  sortKey: "relevance",
  reverse: false,
};

export const sorting: SortOption[] = [
  defaultSort,
  {
    title: "Trending",
    slug: "trending-desc",
    sortKey: "best-selling",
    reverse: false,
  },
  {
    title: "Latest arrivals",
    slug: "latest-desc",
    sortKey: "created-at",
    reverse: true,
  },
  {
    title: "Price: Low to high",
    slug: "price-asc",
    sortKey: "price",
    reverse: false,
  },
  {
    title: "Price: High to low",
    slug: "price-desc",
    sortKey: "price",
    reverse: true,
  },
];
