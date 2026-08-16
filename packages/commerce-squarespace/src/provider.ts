import {
  HIDDEN_PRODUCT_TAG,
  requireConfig,
} from "@corte-so/commerce-core";
import type {
  Collection,
  CommerceCapabilities,
  CommerceProvider,
  GetCollectionProductsOptions,
  GetProductsOptions,
  Product,
} from "@corte-so/commerce-core";
import {
  API_KEY_ENV,
  MAX_PRODUCT_PAGES,
  PRODUCTS_PATH,
  PROVIDER_ID,
  STORE_DOMAIN_ENV,
} from "./constants.js";
import { createSquarespaceClient, type FetchLike } from "./fetch.js";
import { mapProduct, tagToCollection } from "./mappers.js";
import { defaultSort, sortProducts, sorting } from "./sorting.js";
import type { SquarespaceProduct, SquarespaceProductsResponse } from "./types.js";

export type SquarespaceProviderConfig = {
  /** Squarespace API key with the "Products (read)" scope. */
  apiKey: string;
  /** Merchant storefront domain, e.g. "shop.example.com". Used only to
   * absolutize `Product.externalUrl`; the catalog itself never needs it. */
  storeDomain?: string;
  /** Injected for tests and non-global-fetch runtimes. */
  fetch?: FetchLike;
};

/**
 * Squarespace's Commerce API covers the product catalog and nothing else — it
 * exposes no cart, checkout, search, page, or menu resources — so this
 * provider is catalog-only and says so.
 */
const capabilities: CommerceCapabilities = {
  cart: false,
  checkout: false,
  /** `getProducts({ query })` filters client-side, so this stays false. */
  search: false,
  pages: false,
  menus: false,
  recommendations: false,
  webhooks: false,
};

function normalizeStoreDomain(storeDomain?: string): string | undefined {
  const trimmed = storeDomain?.trim();
  if (!trimmed) return undefined;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).href.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

function isHiddenTag(tag: string): boolean {
  return tag.toLowerCase().startsWith("hidden");
}

export function createSquarespaceProvider(
  config: SquarespaceProviderConfig,
): CommerceProvider {
  const client = createSquarespaceClient({
    apiKey: config.apiKey,
    fetch: config.fetch,
  });
  const storeOrigin = normalizeStoreDomain(config.storeDomain);

  /**
   * Walk the catalog, following `pagination.nextPageCursor` until the API says
   * there is no next page. Stops after MAX_PRODUCT_PAGES pages, or if the API
   * hands back a cursor it already gave us, so a misbehaving cursor cannot
   * spin forever.
   */
  const listAllProducts = async (): Promise<SquarespaceProduct[]> => {
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
  };

  /** The catalog as a storefront should see it: hidden products removed. */
  const listVisibleProducts = async (): Promise<SquarespaceProduct[]> => {
    const products = await listAllProducts();
    return products.filter(
      (product) => !(product.tags ?? []).includes(HIDDEN_PRODUCT_TAG),
    );
  };

  const listCollections = async (): Promise<Collection[]> => {
    const products = await listVisibleProducts();
    const collections = new Map<string, Collection>();

    for (const product of products) {
      const updatedAt = product.modifiedOn ?? product.createdOn ?? "";
      for (const tag of product.tags ?? []) {
        if (isHiddenTag(tag) || collections.has(tag)) continue;
        collections.set(tag, tagToCollection(tag, updatedAt));
      }
    }

    return [...collections.values()];
  };

  const finish = (
    products: SquarespaceProduct[],
    options: { sortKey?: GetProductsOptions["sortKey"]; reverse?: boolean },
  ): Product[] =>
    sortProducts(products, options.sortKey, options.reverse).map((product) =>
      mapProduct(product, storeOrigin),
    );

  return {
    id: PROVIDER_ID,
    capabilities,
    sorting,
    defaultSort,

    async getProduct(handle: string): Promise<Product | null> {
      const id = handle?.trim();
      if (!id) return null;
      const data = await client.getOrNull<SquarespaceProductsResponse>(
        `${PRODUCTS_PATH}/${encodeURIComponent(id)}`,
      );
      const product = data?.products?.[0];
      return product ? mapProduct(product, storeOrigin) : null;
    },

    async getProducts(options: GetProductsOptions = {}): Promise<Product[]> {
      let products = await listVisibleProducts();

      const query = options.query?.trim().toLowerCase();
      if (query) {
        products = products.filter((product) =>
          product.name.toLowerCase().includes(query),
        );
      }

      return finish(products, options);
    },

    async getCollection(handle: string): Promise<Collection | null> {
      const collections = await listCollections();
      return collections.find((collection) => collection.handle === handle) ?? null;
    },

    getCollections: listCollections,

    async getCollectionProducts({
      collection,
      sortKey,
      reverse,
    }: GetCollectionProductsOptions): Promise<Product[]> {
      const products = await listVisibleProducts();
      const tagged = products.filter((product) =>
        (product.tags ?? []).includes(collection),
      );
      return finish(tagged, { sortKey, reverse });
    },
  };
}

/** `process.env` where there is a process, `{}` where there isn't (Workers,
 * browsers). Read lazily — never at module scope. */
function ambientEnv(): Record<string, string | undefined> {
  const proc = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process;
  return proc?.env ?? {};
}

/**
 * Build a provider from environment variables:
 * `SQUARESPACE_API_TOKEN` (required) and `SQUARESPACE_STORE_DOMAIN`
 * (optional). The env record is read when this is called, never at module
 * load, so importing the package never touches the environment.
 */
export function squarespaceProviderFromEnv(
  env: Record<string, string | undefined> = ambientEnv(),
): CommerceProvider {
  return createSquarespaceProvider({
    apiKey: requireConfig(env, API_KEY_ENV),
    storeDomain: env[STORE_DOMAIN_ENV],
  });
}
