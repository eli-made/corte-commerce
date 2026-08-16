import type { ProductSortKey, SortOption } from "@corte-so/commerce-core";
import type { SquarespaceProduct } from "./types.js";
import { variantPrice } from "./mappers.js";

/**
 * Only what the provider can actually honor. The Commerce API returns the
 * catalog in its own order and offers no sort parameter, so "Relevance" is
 * that API order, and the price/date options are applied client-side over the
 * fetched catalog.
 */
export const defaultSort: SortOption = {
  title: "Relevance",
  slug: null,
  sortKey: "relevance",
  reverse: false,
};

export const sorting: SortOption[] = [
  defaultSort,
  {
    title: "Latest arrivals",
    slug: "latest-desc",
    sortKey: "created-at",
    reverse: true,
  },
  { title: "Price: Low to high", slug: "price-asc", sortKey: "price", reverse: false },
  { title: "Price: High to low", slug: "price-desc", sortKey: "price", reverse: true },
];

/** Lowest effective (sale-aware) variant price — the "from" price a storefront
 * displays, and what price sorting orders by. */
function lowestPrice(product: SquarespaceProduct): number {
  const prices = (product.variants ?? []).map((variant) => {
    const parsed = Number.parseFloat(variantPrice(variant).amount);
    return Number.isFinite(parsed) ? parsed : 0;
  });
  return prices.length > 0 ? Math.min(...prices) : 0;
}

/**
 * Sort a fetched catalog. `relevance` and `best-selling` have no API
 * equivalent, so they keep the order the API returned.
 */
export function sortProducts(
  products: SquarespaceProduct[],
  sortKey: ProductSortKey = "relevance",
  reverse = false,
): SquarespaceProduct[] {
  const direction = reverse ? -1 : 1;

  if (sortKey === "price") {
    return [...products].sort(
      (a, b) => (lowestPrice(a) - lowestPrice(b)) * direction,
    );
  }

  if (sortKey === "created-at") {
    return [...products].sort((a, b) => {
      const aCreated = a.createdOn ?? "";
      const bCreated = b.createdOn ?? "";
      if (aCreated === bCreated) return 0;
      return (aCreated < bCreated ? -1 : 1) * direction;
    });
  }

  return [...products];
}
