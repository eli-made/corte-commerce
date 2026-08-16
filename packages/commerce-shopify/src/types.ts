/**
 * Shopify Storefront API wire types. These describe what comes back from the
 * GraphQL documents in this package and are deliberately *not* part of the
 * public surface — consumers work with the neutral `@corte-so/commerce-core`
 * domain types that `mappers.ts` produces.
 *
 * Nullability here follows the Storefront schema rather than upstream Next.js
 * Commerce's optimistic typings: `seo.title`, `image.altText`, and
 * `featuredImage` really can come back null, and the mappers handle it.
 */

export type Connection<T> = {
  edges: Array<Edge<T>>;
};

export type Edge<T> = {
  node: T;
};

export type ShopifyMoney = {
  amount: string;
  currencyCode: string;
};

export type ShopifyImage = {
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
};

export type ShopifySEO = {
  title: string | null;
  description: string | null;
};

export type ShopifyProductOption = {
  id: string;
  name: string;
  values: string[];
};

export type ShopifyProductVariant = {
  id: string;
  title: string;
  availableForSale: boolean;
  selectedOptions: { name: string; value: string }[];
  price: ShopifyMoney;
};

export type ShopifyProduct = {
  id: string;
  handle: string;
  availableForSale: boolean;
  title: string;
  description: string;
  descriptionHtml: string;
  options: ShopifyProductOption[];
  priceRange: {
    maxVariantPrice: ShopifyMoney;
    minVariantPrice: ShopifyMoney;
  };
  variants: Connection<ShopifyProductVariant>;
  featuredImage: ShopifyImage | null;
  images: Connection<ShopifyImage>;
  seo: ShopifySEO | null;
  tags: string[];
  updatedAt: string;
};

/** The trimmed product selection carried on cart lines. */
export type ShopifyCartProduct = {
  id: string;
  handle: string;
  title: string;
  featuredImage: ShopifyImage | null;
};

export type ShopifyCartLine = {
  id: string;
  quantity: number;
  cost: {
    totalAmount: ShopifyMoney;
  };
  merchandise: {
    id: string;
    title: string;
    selectedOptions: { name: string; value: string }[];
    product: ShopifyCartProduct;
  };
};

export type ShopifyCart = {
  id: string;
  checkoutUrl: string;
  cost: {
    subtotalAmount: ShopifyMoney;
    totalAmount: ShopifyMoney;
    /** Null until Shopify has an address to compute tax against. */
    totalTaxAmount: ShopifyMoney | null;
  };
  lines: Connection<ShopifyCartLine>;
  totalQuantity: number;
};

export type ShopifyCollection = {
  handle: string;
  title: string;
  description: string;
  seo: ShopifySEO | null;
  updatedAt: string;
};

export type ShopifyPage = {
  id: string;
  title: string;
  handle: string;
  body: string;
  bodySummary: string;
  seo: ShopifySEO | null;
  createdAt: string;
  updatedAt: string;
};

export type ShopifyMenuItem = {
  title: string;
  url: string;
};

/* -------------------------------------------------------------------------- */
/* Operation payloads — the `data` object of each document in this package.    */
/* -------------------------------------------------------------------------- */

export type GetProductData = { product: ShopifyProduct | null };
export type GetProductsData = { products: Connection<ShopifyProduct> };
export type GetProductRecommendationsData = {
  productRecommendations: ShopifyProduct[] | null;
};
export type GetCollectionData = { collection: ShopifyCollection | null };
export type GetCollectionsData = { collections: Connection<ShopifyCollection> };
export type GetCollectionProductsData = {
  collection: { products: Connection<ShopifyProduct> } | null;
};
export type GetMenuData = { menu: { items: ShopifyMenuItem[] } | null };
export type GetPageData = { pageByHandle: ShopifyPage | null };
export type GetPagesData = { pages: Connection<ShopifyPage> };
export type GetCartData = { cart: ShopifyCart | null };
export type CreateCartData = { cartCreate: { cart: ShopifyCart } };
export type AddToCartData = { cartLinesAdd: { cart: ShopifyCart } };
export type UpdateCartData = { cartLinesUpdate: { cart: ShopifyCart } };
export type RemoveFromCartData = { cartLinesRemove: { cart: ShopifyCart } };
