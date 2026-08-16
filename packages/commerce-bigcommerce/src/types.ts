// Wire types: the shapes the BigCommerce Storefront GraphQL API actually
// returns for the documents in queries/ and mutations/. Nothing here is part
// of the public contract — `mappers.ts` turns these into core domain types.

export type Connection<T> = {
  edges: Array<{ node: T }> | null;
};

export type BigCommerceMoney = {
  value: number;
  currencyCode: string;
};

export type BigCommerceSEO = {
  pageTitle: string;
  metaDescription: string;
  metaKeywords: string;
};

export type BigCommerceImage = {
  url: string;
  altText: string;
};

export type BigCommerceProductOption = {
  __typename: string;
  entityId: number;
  displayName: string;
  isRequired?: boolean;
  displayStyle?: string;
  values?: Connection<{ entityId: number; label: string; isDefault?: boolean }>;
};

export type BigCommerceProductVariant = {
  entityId: number;
  sku: string;
  isPurchasable: boolean;
  prices: {
    price: BigCommerceMoney | null;
    priceRange: { min: BigCommerceMoney; max: BigCommerceMoney } | null;
  } | null;
  options: Connection<{
    entityId: number;
    displayName: string;
    values: Connection<{ entityId: number; label: string }>;
  }> | null;
};

export type BigCommerceProduct = {
  entityId: number;
  sku: string;
  name: string;
  brand: { name: string } | null;
  plainTextDescription: string | null;
  description: string | null;
  availabilityV2: { status: string; description: string };
  defaultImage: BigCommerceImage | null;
  images: Connection<BigCommerceImage> | null;
  seo: BigCommerceSEO | null;
  path: string;
  prices: {
    price: BigCommerceMoney | null;
    priceRange: { min: BigCommerceMoney; max: BigCommerceMoney } | null;
  } | null;
  createdAt: { utc: string } | null;
  variants: Connection<BigCommerceProductVariant> | null;
  productOptions: Connection<BigCommerceProductOption> | null;
};

export type BigCommerceCategory = {
  entityId: number;
  name: string;
  path: string;
  description: string | null;
  seo: BigCommerceSEO | null;
};

export type BigCommerceCategoryTreeItem = {
  entityId: number;
  name: string;
  path: string;
  hasChildren?: boolean;
  children?: BigCommerceCategoryTreeItem[] | null;
};

export type BigCommercePage = {
  __typename: "NormalPage" | "ContactPage" | "RawHtmlPage" | "BlogIndexPage";
  entityId: number;
  name: string;
  isVisibleInNavigation: boolean;
  seo: BigCommerceSEO | null;
  path: string;
  plainTextSummary?: string | null;
  htmlBody?: string | null;
};

export type BigCommerceCheckout = {
  subtotal: BigCommerceMoney | null;
  taxTotal: BigCommerceMoney | null;
  grandTotal: BigCommerceMoney | null;
};

export type BigCommerceSelectedOption = {
  entityId: number;
  name: string;
  value?: string | null;
  text?: string | null;
  number?: number | string | null;
  fileName?: string | null;
  date?: { utc: string } | null;
};

/** Physical and digital line items share every field this package reads. */
export type BigCommerceLineItem = {
  entityId: string | number;
  parentEntityId?: number | null;
  productEntityId: number;
  variantEntityId: number | null;
  sku: string | null;
  name: string;
  url: string | null;
  imageUrl: string | null;
  brand: string | null;
  quantity: number;
  listPrice: BigCommerceMoney;
  extendedListPrice: BigCommerceMoney;
  extendedSalePrice?: BigCommerceMoney | null;
  selectedOptions: BigCommerceSelectedOption[] | null;
};

/** Custom items are merchant-invented lines with no catalog product behind them. */
export type BigCommerceCustomItem = {
  entityId: string | number;
  sku: string | null;
  name: string;
  quantity: number;
  listPrice: BigCommerceMoney;
  extendedListPrice: BigCommerceMoney;
};

export type BigCommerceCart = {
  entityId: string;
  currencyCode: string;
  isTaxIncluded: boolean;
  amount: BigCommerceMoney | null;
  lineItems: {
    totalQuantity: number;
    physicalItems: BigCommerceLineItem[] | null;
    digitalItems: BigCommerceLineItem[] | null;
    customItems: BigCommerceCustomItem[] | null;
  };
};

export type BigCommerceRedirectUrls = {
  redirectedCheckoutUrl: string | null;
  embeddedCheckoutUrl: string | null;
  cartUrl: string | null;
};

export type BigCommerceRouteNode = {
  __typename: string;
  entityId: number;
} | null;

// ---------------------------------------------------------------------------
// Operation shapes (response `data` payloads)
// ---------------------------------------------------------------------------

export type ProductQueryData = {
  site: { product: BigCommerceProduct | null };
};

export type ProductsCollectionQueryData = {
  site: { category: { products: Connection<BigCommerceProduct> } | null };
};

export type SearchProductsQueryData = {
  site: {
    search: { searchProducts: { products: Connection<BigCommerceProduct> } };
  };
};

export type RecommendationsQueryData = {
  site: {
    product: { relatedProducts: Connection<BigCommerceProduct> } | null;
  };
};

export type NewestProductsQueryData = {
  site: { newestProducts: Connection<BigCommerceProduct> | null };
};

export type FeaturedProductsQueryData = {
  site: { featuredProducts: Connection<BigCommerceProduct> | null };
};

export type CategoryQueryData = {
  site: { category: BigCommerceCategory | null };
};

export type CategoryTreeQueryData = {
  site: { categoryTree: BigCommerceCategoryTreeItem[] | null };
};

export type PageQueryData = {
  site: { content: { page: BigCommercePage | null } };
};

export type PagesQueryData = {
  site: { content: { pages: Connection<BigCommercePage> } };
};

export type RouteQueryData = {
  site: { route: { node: BigCommerceRouteNode } };
};

export type CartQueryData = {
  site: { cart: BigCommerceCart | null };
};

export type CheckoutQueryData = {
  site: { checkout: BigCommerceCheckout | null };
};

export type CreateCartMutationData = {
  cart: { createCart: { cart: BigCommerceCart } };
};

export type AddCartLineItemsMutationData = {
  cart: { addCartLineItems: { cart: BigCommerceCart } };
};

export type UpdateCartLineItemMutationData = {
  cart: { updateCartLineItem: { cart: BigCommerceCart } };
};

export type DeleteCartLineItemMutationData = {
  cart: {
    deleteCartLineItem: {
      deletedLineItemEntityId: string | null;
      deletedCartEntityId: string | null;
      cart: BigCommerceCart | null;
    };
  };
};

export type CreateCartRedirectUrlsMutationData = {
  cart: {
    createCartRedirectUrls: { redirectUrls: BigCommerceRedirectUrls | null };
  };
};
