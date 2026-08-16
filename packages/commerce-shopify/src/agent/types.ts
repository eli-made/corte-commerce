/**
 * Shopify **Admin** GraphQL wire types for the agent backend. As with the
 * storefront `types.ts`, these describe what the documents in `queries.ts`
 * return and are not part of the public surface — consumers only ever see the
 * neutral `Agent*` shapes from `@corte-so/commerce-agent-tools`.
 *
 * Every document here selects `nodes` rather than `edges { node }`; the Admin
 * API supports both and cursors are of no use to a chat-sized result set.
 */

export type AdminConnection<T> = {
  nodes: T[];
};

export type AdminMoneyV2 = {
  amount: string;
  currencyCode: string;
};

export type AdminImage = {
  url: string;
  altText: string | null;
};

/** `media` nodes that aren't `MediaImage` (video, 3D model) come back as `{}`. */
export type AdminMediaNode = {
  image?: AdminImage | null;
};

export type AdminSEO = {
  title: string | null;
  description: string | null;
};

export type AdminProductOption = {
  id: string;
  name: string;
  values: string[];
};

/** Admin variants price with the `Money` scalar — a bare decimal string, with
 * no currency of its own; it is the shop's currency. */
export type AdminProductVariant = {
  id: string;
  title: string;
  price: string;
  availableForSale: boolean;
};

export type AdminProductSummary = {
  id: string;
  handle: string;
  title: string;
  /** `ACTIVE` | `DRAFT` | `ARCHIVED`. */
  status: string;
  tags: string[];
  updatedAt: string;
  featuredMedia: { preview: { image: AdminImage | null } | null } | null;
  priceRangeV2: {
    minVariantPrice: AdminMoneyV2;
    maxVariantPrice: AdminMoneyV2;
  };
};

export type AdminProductDetail = AdminProductSummary & {
  description: string;
  seo: AdminSEO | null;
  options: AdminProductOption[];
  variants: AdminConnection<AdminProductVariant>;
  media: AdminConnection<AdminMediaNode>;
};

export type AdminCollection = {
  id: string;
  handle: string;
  title: string;
  description: string;
  /** `Count` object since API 2024-07; null when Shopify declines to count. */
  productsCount: { count: number } | null;
};

export type AdminOrderLineItem = {
  title: string;
  quantity: number;
};

export type AdminOrder = {
  id: string;
  /** Merchant-facing order number, e.g. "#1001". */
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  totalPriceSet: { shopMoney: AdminMoneyV2 };
  customer: { displayName: string | null; email: string | null } | null;
  lineItems: AdminConnection<AdminOrderLineItem>;
};

export type AdminUserError = {
  field: string[] | null;
  message: string;
};

/* -------------------------------------------------------------------------- */
/* Operation payloads — the `data` object of each document in queries.ts.      */
/* -------------------------------------------------------------------------- */

export type AdminListProductsData = {
  products: AdminConnection<AdminProductSummary>;
};
export type AdminGetProductData = { product: AdminProductDetail | null };
export type AdminFindProductData = {
  products: AdminConnection<AdminProductDetail>;
};
export type AdminFindProductIdData = {
  products: AdminConnection<{ id: string }>;
};
export type AdminListCollectionsData = {
  collections: AdminConnection<AdminCollection>;
};
export type AdminUpdateProductData = {
  productUpdate: {
    product: AdminProductDetail | null;
    userErrors: AdminUserError[];
  } | null;
};
export type AdminListOrdersData = { orders: AdminConnection<AdminOrder> };
