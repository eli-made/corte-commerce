import {
  CommerceError,
  DEFAULT_OPTION,
  HIDDEN_PRODUCT_TAG,
  type Cart,
  type CartItem,
  type Collection,
  type Image,
  type Menu,
  type Money,
  type Page,
  type Product,
  type ProductOption,
  type ProductSortKey,
  type ProductVariant,
  type SortOption,
} from "@corte-so/commerce-core";

import type {
  BigCommerceCart,
  BigCommerceCategory,
  BigCommerceCategoryTreeItem,
  BigCommerceCheckout,
  BigCommerceCustomItem,
  BigCommerceImage,
  BigCommerceLineItem,
  BigCommerceMoney,
  BigCommercePage,
  BigCommerceProduct,
  BigCommerceProductOption,
  BigCommerceProductVariant,
  BigCommerceSelectedOption,
  Connection,
} from "./types.js";

/**
 * The Storefront API does not return image dimensions, and images are
 * requested at a fixed render width (see `ImageFields` in fragments/product).
 * Core's `Image` requires numbers, so the requested width is reported as a
 * square — layout code should treat these as hints, not measurements.
 */
const IMAGE_RENDER_SIZE = 1080;

export const nodes = <T>(connection: Connection<T> | null | undefined): T[] =>
  connection?.edges?.map((edge) => edge.node) ?? [];

/**
 * BigCommerce returns money as a JSON number; core requires a decimal string.
 * Amounts are normalised to two decimal places, which is what every storefront
 * currency BigCommerce prices in uses for display.
 */
export const toMoney = (
  money: BigCommerceMoney | null | undefined,
  fallbackCurrency = "",
): Money => ({
  amount: typeof money?.value === "number" ? money.value.toFixed(2) : "0.00",
  currencyCode: money?.currencyCode || fallbackCurrency,
});

/** `/blue-shirt/` → `blue-shirt`. Internal slashes survive, so nested product
 * and category paths round-trip back to the route query unchanged. */
export const slugFromPath = (path: string | null | undefined): string =>
  (path ?? "").replace(/^\/+/, "").replace(/\/+$/, "");

/** Inverse of `slugFromPath`, in the shape `site.route(path:)` expects. */
export const pathFromSlug = (slug: string): string =>
  `/${slug.replace(/^\/+/, "").replace(/\/+$/, "")}`;

/** Absolute line-item URL → storefront handle. */
export const slugFromUrl = (url: string | null | undefined): string => {
  if (!url) return "";
  try {
    return slugFromPath(new URL(url).pathname);
  } catch {
    return slugFromPath(url);
  }
};

/**
 * Merchandise ids are `productEntityId:variantEntityId`.
 *
 * BigCommerce cart mutations always need the product entity id and treat the
 * variant as optional, while core's `CartLineInput` carries a single opaque
 * merchandise id. Encoding both into the id this package hands out keeps the
 * cart operations self-sufficient: no slug lookup, no second round trip.
 * A bare numeric id is accepted and read as a product with no variant, which
 * is how BigCommerce addresses single-variant products.
 */
export const encodeMerchandiseId = (
  productEntityId: number,
  variantEntityId?: number | null,
): string =>
  variantEntityId === null || variantEntityId === undefined
    ? String(productEntityId)
    : `${productEntityId}:${variantEntityId}`;

export const parseMerchandiseId = (
  merchandiseId: string,
): { productEntityId: number; variantEntityId?: number } => {
  const [product, variant] = String(merchandiseId).split(":");
  const productEntityId = Number.parseInt(product ?? "", 10);

  if (!Number.isFinite(productEntityId)) {
    throw new CommerceError(
      `[bigcommerce] Unusable merchandise id "${merchandiseId}" — expected "productEntityId:variantEntityId"`,
    );
  }

  if (variant === undefined || variant === "") {
    return { productEntityId };
  }

  const variantEntityId = Number.parseInt(variant, 10);

  return Number.isFinite(variantEntityId)
    ? { productEntityId, variantEntityId }
    : { productEntityId };
};

const toImage = (
  image: BigCommerceImage | null | undefined,
  fallbackAlt = "",
): Image | undefined =>
  image?.url
    ? {
        url: image.url,
        altText: image.altText || fallbackAlt,
        width: IMAGE_RENDER_SIZE,
        height: IMAGE_RENDER_SIZE,
      }
    : undefined;

const toOptions = (
  options: BigCommerceProductOption[],
): ProductOption[] =>
  options.map((option) => ({
    id: String(option.entityId),
    name: option.displayName,
    values: nodes(option.values).map((value) => value.label),
  }));

const variantSelectedOptions = (
  variant: BigCommerceProductVariant,
): { name: string; value: string }[] =>
  nodes(variant.options).map((option) => ({
    name: option.displayName ?? "",
    value: nodes(option.values)[0]?.label ?? "",
  }));

/** BigCommerce variants have no title; core requires one. It is synthesised
 * from the selected option values, exactly as a Shopify variant title reads. */
const variantTitle = (
  selectedOptions: { name: string; value: string }[],
): string => {
  const title = selectedOptions
    .map((option) => option.value)
    .filter(Boolean)
    .join(" / ");

  return title || DEFAULT_OPTION;
};

const toVariants = (
  variants: BigCommerceProductVariant[],
  product: BigCommerceProduct,
): ProductVariant[] =>
  variants.map((variant) => {
    const selectedOptions = variantSelectedOptions(variant);

    return {
      id: encodeMerchandiseId(product.entityId, variant.entityId),
      title: variantTitle(selectedOptions),
      availableForSale: variant.isPurchasable,
      selectedOptions,
      price: toMoney(
        variant.prices?.price ??
          variant.prices?.priceRange?.min ??
          product.prices?.price,
      ),
    };
  });

/** Comma-separated SEO keywords are the closest thing BigCommerce has to
 * Shopify tags, and are what `HIDDEN_PRODUCT_TAG` is matched against. */
const toTags = (keywords: string | null | undefined): string[] =>
  (keywords ?? "")
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);

export const toProduct = (
  product: BigCommerceProduct,
  options: { storefrontUrl?: string } = {},
): Product => {
  const prices = product.prices;
  const min = prices?.priceRange?.min ?? prices?.price;
  const max = prices?.priceRange?.max ?? prices?.price;
  const featuredImage = toImage(product.defaultImage, product.name);
  const images = nodes(product.images)
    .map((image) => toImage(image, product.name))
    .filter((image): image is Image => image !== undefined);
  const variants = toVariants(nodes(product.variants), product);

  return {
    id: String(product.entityId),
    handle: slugFromPath(product.path) || String(product.entityId),
    availableForSale: product.availabilityV2?.status === "Available",
    title: product.name,
    description: product.plainTextDescription ?? "",
    descriptionHtml: product.description ?? "",
    options: toOptions(nodes(product.productOptions)),
    priceRange: {
      minVariantPrice: toMoney(min),
      maxVariantPrice: toMoney(max),
    },
    ...(featuredImage ? { featuredImage } : {}),
    seo: {
      title: product.seo?.pageTitle || product.name,
      description: product.seo?.metaDescription || "",
    },
    tags: toTags(product.seo?.metaKeywords),
    // BigCommerce's Storefront API exposes `createdAt` but no modification
    // timestamp, so creation time stands in for `updatedAt`.
    updatedAt: product.createdAt?.utc ?? "",
    variants:
      variants.length > 0
        ? variants
        : // A product with no variant rows is still purchasable by product id.
          [
            {
              id: encodeMerchandiseId(product.entityId),
              title: DEFAULT_OPTION,
              availableForSale:
                product.availabilityV2?.status === "Available",
              selectedOptions: [],
              price: toMoney(prices?.price ?? min),
            },
          ],
    images: images.length > 0 ? images : featuredImage ? [featuredImage] : [],
    ...(options.storefrontUrl
      ? {
          externalUrl: `${options.storefrontUrl.replace(/\/+$/, "")}/${slugFromPath(product.path)}`,
        }
      : {}),
  };
};

export const isHiddenProduct = (product: Product): boolean =>
  product.tags.includes(HIDDEN_PRODUCT_TAG);

/** Maps a product list, dropping nulls and storefront-hidden products. */
export const toProducts = (
  products: Array<BigCommerceProduct | null | undefined>,
  options: { storefrontUrl?: string } = {},
): Product[] =>
  products
    .filter((product): product is BigCommerceProduct => Boolean(product))
    .map((product) => toProduct(product, options))
    .filter((product) => !isHiddenProduct(product));

export const toCollection = (
  category: BigCommerceCategory,
): Collection => {
  const handle = slugFromPath(category.path) || String(category.entityId);

  return {
    handle,
    title: category.name,
    description: category.description ?? "",
    seo: {
      title: category.seo?.pageTitle || category.name,
      description: category.seo?.metaDescription || "",
    },
    // Categories carry no timestamps in the Storefront API; collections are
    // reported as current so cache keys derived from this never go stale.
    updatedAt: new Date().toISOString(),
    path: `/search/${handle}`,
  };
};

const selectedOptionValue = (option: BigCommerceSelectedOption): string => {
  if (option.value) return option.value;
  if (option.text) return option.text;
  if (option.number !== null && option.number !== undefined) {
    return String(option.number);
  }
  if (option.fileName) return option.fileName;
  if (option.date?.utc) return option.date.utc;
  return "";
};

const toCartLine = (item: BigCommerceLineItem): CartItem => {
  const selectedOptions = (item.selectedOptions ?? []).map((option) => ({
    name: option.name,
    value: selectedOptionValue(option),
  }));
  const image = item.imageUrl
    ? {
        url: item.imageUrl,
        altText: item.name,
        width: IMAGE_RENDER_SIZE,
        height: IMAGE_RENDER_SIZE,
      }
    : undefined;

  return {
    id: String(item.entityId),
    quantity: item.quantity,
    cost: {
      // Sale price is what the shopper pays; list price is the pre-discount
      // figure and only stands in when the API omits the sale total.
      totalAmount: toMoney(item.extendedSalePrice ?? item.extendedListPrice),
    },
    merchandise: {
      id: encodeMerchandiseId(item.productEntityId, item.variantEntityId),
      title: variantTitle(selectedOptions),
      selectedOptions,
      product: {
        id: String(item.productEntityId),
        handle: slugFromUrl(item.url),
        title: item.name,
        ...(image ? { featuredImage: image } : {}),
      },
    },
  };
};

/** Custom items are invented at cart time and have no catalog product, so the
 * embedded product is the line itself with an empty id and handle. */
const toCustomCartLine = (item: BigCommerceCustomItem): CartItem => ({
  id: String(item.entityId),
  quantity: item.quantity,
  cost: { totalAmount: toMoney(item.extendedListPrice) },
  merchandise: {
    id: String(item.entityId),
    title: DEFAULT_OPTION,
    selectedOptions: [],
    product: { id: "", handle: "", title: item.name },
  },
});

export const toCartLines = (lineItems: BigCommerceCart["lineItems"]): CartItem[] => [
  ...(lineItems.physicalItems ?? []).map(toCartLine),
  ...(lineItems.digitalItems ?? []).map(toCartLine),
  ...(lineItems.customItems ?? []).map(toCustomCartLine),
];

export const toCart = (
  cart: BigCommerceCart,
  options: {
    checkout?: BigCommerceCheckout | null;
    checkoutUrl?: string | null;
  } = {},
): Cart => {
  const currency = cart.currencyCode;
  const { checkout } = options;

  return {
    id: cart.entityId,
    checkoutUrl: options.checkoutUrl ?? "",
    cost: {
      // Subtotal/tax/total live on the checkout that shares the cart's id; the
      // cart's own `amount` is the fallback when no checkout exists yet.
      subtotalAmount: toMoney(checkout?.subtotal ?? cart.amount, currency),
      totalAmount: toMoney(checkout?.grandTotal ?? cart.amount, currency),
      totalTaxAmount: toMoney(checkout?.taxTotal, currency),
    },
    totalQuantity: cart.lineItems.totalQuantity,
    lines: toCartLines(cart.lineItems),
  };
};

/** The cart every operation reports when BigCommerce has no cart to describe:
 * before the first line is added, and after the last one is removed (BigCommerce
 * deletes a cart with its final line item). */
export const emptyCart = (): Cart => ({
  id: "",
  checkoutUrl: "",
  cost: {
    subtotalAmount: { amount: "0.00", currencyCode: "" },
    totalAmount: { amount: "0.00", currencyCode: "" },
    totalTaxAmount: { amount: "0.00", currencyCode: "" },
  },
  totalQuantity: 0,
  lines: [],
});

export const toPage = (page: BigCommercePage): Page => ({
  id: String(page.entityId),
  title: page.name,
  handle: slugFromPath(page.path),
  body: page.htmlBody ?? "",
  bodySummary: page.plainTextSummary ?? "",
  seo: {
    title: page.seo?.pageTitle || page.name,
    description: page.seo?.metaDescription || "",
  },
  // Web pages expose no timestamps in the Storefront API.
  createdAt: "",
  updatedAt: "",
});

/** Header menu: top-level categories, linking into collection search pages. */
export const toHeaderMenu = (tree: BigCommerceCategoryTreeItem[]): Menu[] =>
  tree.map((item) => ({
    title: item.name,
    path: `/search/${slugFromPath(item.path)}`,
  }));

/** Footer menu: navigation-visible web pages. The blog index is skipped —
 * it is not a content page and needs its own rendering. */
export const toFooterMenu = (pages: BigCommercePage[]): Menu[] =>
  pages
    .filter(
      (page) =>
        page.isVisibleInNavigation && page.__typename !== "BlogIndexPage",
    )
    .map((page) => ({
      title: page.name,
      path: `/${slugFromPath(page.path)}`,
    }));

/** Depth-first search of the category tree for a slug, matching the last path
 * segment first and falling back to a path-contains match. */
export const findCategoryId = (
  tree: BigCommerceCategoryTreeItem[],
  slug: string,
): number | undefined => {
  const target = slugFromPath(slug);

  for (const item of tree) {
    if (slugFromPath(item.path) === target) return item.entityId;
  }

  for (const item of tree) {
    if (item.children?.length) {
      const found = findCategoryId(item.children, target);
      if (found !== undefined) return found;
    }
  }

  for (const item of tree) {
    if (target && item.path?.includes(target)) return item.entityId;
  }

  return undefined;
};

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/** `SearchProductsSortInput` values this provider emits. */
type SearchSort =
  | "RELEVANCE"
  | "BEST_SELLING"
  | "NEWEST"
  | "LOWEST_PRICE"
  | "HIGHEST_PRICE";

/** `CategoryProductSort` values this provider emits. `DEFAULT` is the category's
 * own merchandised order — the closest thing a category has to relevance. */
type CategorySort =
  | "DEFAULT"
  | "BEST_SELLING"
  | "NEWEST"
  | "LOWEST_PRICE"
  | "HIGHEST_PRICE";

/**
 * Core's neutral sort keys mapped onto BigCommerce's native enums.
 *
 * `created-at` has only a newest-first enum, so `reverse: false` (oldest
 * first) cannot be honoured and still sorts newest first.
 */
export const toSearchSort = (
  sortKey: ProductSortKey | undefined,
  reverse = false,
): SearchSort | null => {
  switch (sortKey) {
    case "best-selling":
      return "BEST_SELLING";
    case "created-at":
      return "NEWEST";
    case "price":
      return reverse ? "HIGHEST_PRICE" : "LOWEST_PRICE";
    case "relevance":
      return "RELEVANCE";
    default:
      return null;
  }
};

export const toCategorySort = (
  sortKey: ProductSortKey | undefined,
  reverse = false,
): CategorySort | null => {
  const sort = toSearchSort(sortKey, reverse);
  if (sort === null) return null;
  return sort === "RELEVANCE" ? "DEFAULT" : sort;
};

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
