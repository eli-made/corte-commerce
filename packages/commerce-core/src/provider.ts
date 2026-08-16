import type { Cart, Collection, Menu, Page, Product } from "./types.js";

/**
 * What a provider can actually do. Catalog reads are the baseline every
 * provider must implement and are therefore not a flag. Templates render
 * against these flags — a provider with `cart: false` gets no cart drawer,
 * no add-to-cart buttons, and (if products carry `externalUrl`) "View on
 * store" links instead.
 *
 * Flags are honest promises, not aspirations: a capability is only declared
 * when the corresponding operations are implemented against documented,
 * supported provider APIs.
 */
export type CommerceCapabilities = {
  /** Cart create/read/add/update/remove. */
  cart: boolean;
  /** `Cart.checkoutUrl` leads to a real checkout. Requires `cart`. */
  checkout: boolean;
  /** `getProducts({ query })` is a real server-side search, not a client-side
   * filter over the full catalog. */
  search: boolean;
  /** `getPage` / `getPages`. */
  pages: boolean;
  /** `getMenu`. */
  menus: boolean;
  /** `getProductRecommendations`. */
  recommendations: boolean;
  /** `webhooks.classify` can turn provider webhooks into revalidation hints. */
  webhooks: boolean;
};

/** Provider-neutral sort vocabulary. Providers expose only the entries they
 * support via `sorting`; they map these onto native sort params internally. */
export type ProductSortKey =
  | "relevance"
  | "best-selling"
  | "created-at"
  | "price";

export type SortOption = {
  /** Human label, e.g. "Price: Low to high". */
  title: string;
  /** URL slug for the option, e.g. "price-asc". `null` marks the default. */
  slug: string | null;
  sortKey: ProductSortKey;
  reverse: boolean;
};

export type GetProductsOptions = {
  /** Free-text query. Only meaningful when `capabilities.search` is true;
   * providers without search may ignore it or filter client-side (and must
   * declare `search: false` if they do). */
  query?: string;
  sortKey?: ProductSortKey;
  reverse?: boolean;
};

export type GetCollectionProductsOptions = {
  collection: string;
  sortKey?: ProductSortKey;
  reverse?: boolean;
};

/** A line to add: the variant (unit of purchase) and how many. */
export type CartLineInput = {
  merchandiseId: string;
  quantity: number;
};

/** An existing cart line to change. `quantity: 0` is not special-cased —
 * use `removeFromCart` to delete lines. */
export type CartLineUpdate = {
  id: string;
  merchandiseId: string;
  quantity: number;
};

/**
 * Cart operations, present only on providers that declare `cart: true`.
 * All operations take the cart id explicitly — this package is framework-free
 * and never reads cookies or ambient state. Cookie persistence is the job of
 * an adapter (e.g. @corte-so/commerce-next).
 */
export interface CartOperations {
  createCart(): Promise<Cart>;
  /** `null` when the id is unknown/expired — callers should create a new cart. */
  getCart(cartId: string): Promise<Cart | null>;
  addToCart(cartId: string, lines: CartLineInput[]): Promise<Cart>;
  updateCart(cartId: string, lines: CartLineUpdate[]): Promise<Cart>;
  removeFromCart(cartId: string, lineIds: string[]): Promise<Cart>;
}

/** What changed, according to a provider webhook. Hosts map this to cache
 * invalidation however their framework spells it. */
export type WebhookClassification = {
  scope: "products" | "collections";
};

export interface WebhookOperations {
  /**
   * Inspect an incoming webhook request and decide whether (and what) to
   * revalidate. Returns `null` for requests that should be ignored — wrong
   * secret, unknown topic. Framework-free: takes raw request pieces, never a
   * framework Request type.
   */
  classify(input: {
    headers: Record<string, string | null | undefined>;
    searchParams?: URLSearchParams;
    body?: string;
  }): WebhookClassification | null;
}

/**
 * The provider contract. Catalog methods are mandatory; everything else is
 * optional and mirrored by a capability flag. `assertProviderShape` checks
 * that flags and implementations agree.
 */
export interface CommerceProvider {
  /** Stable provider id, e.g. "shopify". Lowercase, no spaces. */
  readonly id: string;
  readonly capabilities: CommerceCapabilities;

  /** Sort options this provider supports. Must contain `defaultSort`. */
  readonly sorting: SortOption[];
  readonly defaultSort: SortOption;

  getProduct(handle: string): Promise<Product | null>;
  getProducts(options?: GetProductsOptions): Promise<Product[]>;
  getCollection(handle: string): Promise<Collection | null>;
  getCollections(): Promise<Collection[]>;
  getCollectionProducts(options: GetCollectionProductsOptions): Promise<Product[]>;

  cart?: CartOperations;
  getMenu?(handle: string): Promise<Menu[]>;
  getPage?(handle: string): Promise<Page | null>;
  getPages?(): Promise<Page[]>;
  getProductRecommendations?(productId: string): Promise<Product[]>;
  webhooks?: WebhookOperations;
}

/**
 * Verify that a provider's capability flags agree with what it implements.
 * Provider packages call this in their own tests; hosts may call it once at
 * startup. Throws with every violation listed, not just the first.
 */
export function assertProviderShape(provider: CommerceProvider): void {
  const problems: string[] = [];
  const { capabilities: c } = provider;

  const need = (flag: boolean, present: boolean, what: string) => {
    if (flag && !present) problems.push(`declares ${what} but does not implement it`);
    if (!flag && present) problems.push(`implements ${what} but does not declare it`);
  };

  need(c.cart, provider.cart !== undefined, "cart");
  need(c.pages, provider.getPage !== undefined && provider.getPages !== undefined, "pages");
  need(c.menus, provider.getMenu !== undefined, "menus");
  need(
    c.recommendations,
    provider.getProductRecommendations !== undefined,
    "recommendations",
  );
  need(c.webhooks, provider.webhooks !== undefined, "webhooks");

  if (c.checkout && !c.cart) {
    problems.push("declares checkout without cart — checkout requires a cart");
  }
  if (!provider.sorting.includes(provider.defaultSort)) {
    problems.push("defaultSort is not one of sorting");
  }
  if (!/^[a-z][a-z0-9-]*$/.test(provider.id)) {
    problems.push(`id "${provider.id}" must be lowercase alphanumeric/dashes`);
  }

  if (problems.length > 0) {
    throw new Error(
      `CommerceProvider "${provider.id}" is inconsistent:\n- ${problems.join("\n- ")}`,
    );
  }
}
