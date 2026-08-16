import type { Money, ProductSortKey } from "@corte-so/commerce-core";

// Agent-facing result shapes: trimmed for chat context windows, JSON-plain,
// and identical across providers. Backends map admin-API responses onto these
// the same way storefront providers map onto the core domain model.

export type AgentProductSummary = {
  id: string;
  handle: string;
  title: string;
  availableForSale: boolean;
  priceRange: { minVariantPrice: Money; maxVariantPrice: Money };
  tags: string[];
  updatedAt: string;
  featuredImageUrl?: string;
  /** Product page on the merchant's storefront, when known. */
  externalUrl?: string;
};

export type AgentProductDetail = AgentProductSummary & {
  description: string;
  options: { name: string; values: string[] }[];
  variants: {
    id: string;
    title: string;
    price: Money;
    availableForSale: boolean;
  }[];
  images: { url: string; altText: string }[];
  seo: { title: string; description: string };
};

export type AgentCollection = {
  handle: string;
  title: string;
  description: string;
  path: string;
  /** Present when the provider can report it cheaply. */
  productCount?: number;
};

export type AgentOrderSummary = {
  id: string;
  /** Human-facing order number when the provider distinguishes it from id. */
  number?: string;
  status: string;
  createdAt: string;
  total: Money;
  customer?: { name?: string; email?: string };
  lineCount: number;
  /** e.g. "2× Linen Shirt, 1× Belt" — small enough for chat. */
  lineSummary?: string;
};

export type ListProductsArgs = {
  query?: string;
  sortKey?: ProductSortKey;
  reverse?: boolean;
  limit: number;
};

export type ListOrdersArgs = {
  limit: number;
  status: "any" | "open" | "completed" | "canceled";
};

export type UpdateProductChanges = {
  title?: string;
  description?: string;
  tags?: string[];
  visible?: boolean;
  seo?: { title?: string; description?: string };
};

/**
 * What a provider implements to power the agent tool suite. Mandatory methods
 * mirror the mandatory catalog half of `CommerceProvider`; optional methods
 * cause their tool to be omitted from the generated set — absence, not stubs.
 *
 * Backends are constructed as a closure around a provider admin *client*
 * (never a raw credential in tool args), e.g.:
 *
 *   const backend = createShopifyAgentBackend(
 *     createShopifyAdminClient({ storeDomain, accessToken }),
 *   );
 */
export interface CommerceAgentBackend {
  /** Provider id, e.g. "shopify" — hosts prefix tool names with it. */
  readonly providerId: string;

  listProducts(args: ListProductsArgs): Promise<AgentProductSummary[]>;
  /** `idOrHandle` accepts either; backends resolve whichever they index by. */
  getProduct(idOrHandle: string): Promise<AgentProductDetail | null>;

  listCollections?(): Promise<AgentCollection[]>;
  updateProduct?(
    id: string,
    changes: UpdateProductChanges,
  ): Promise<AgentProductDetail>;
  listOrders?(args: ListOrdersArgs): Promise<AgentOrderSummary[]>;
}
