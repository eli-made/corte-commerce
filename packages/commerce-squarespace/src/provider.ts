import { requireConfig } from "@corte-so/commerce-core";
import type {
  Collection,
  CommerceCapabilities,
  CommerceProvider,
  GetCollectionProductsOptions,
  GetProductsOptions,
  Product,
} from "@corte-so/commerce-core";
import {
  getProductById,
  listVisibleProducts,
  normalizeStoreDomain,
  tagGroups,
} from "./catalog.js";
import { API_KEY_ENV, PROVIDER_ID, STORE_DOMAIN_ENV } from "./constants.js";
import { ambientEnv } from "./env.js";
import { createSquarespaceClient, type FetchLike } from "./fetch.js";
import { mapProduct, tagToCollection } from "./mappers.js";
import { defaultSort, sortProducts, sorting } from "./sorting.js";
import type { SquarespaceProduct } from "./types.js";

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

export function createSquarespaceProvider(
  config: SquarespaceProviderConfig,
): CommerceProvider {
  const client = createSquarespaceClient({
    apiKey: config.apiKey,
    fetch: config.fetch,
  });
  const storeOrigin = normalizeStoreDomain(config.storeDomain);

  const listCollections = async (): Promise<Collection[]> => {
    const products = await listVisibleProducts(client);
    return tagGroups(products).map((group) =>
      tagToCollection(group.tag, group.updatedAt),
    );
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
      const product = await getProductById(client, handle);
      return product ? mapProduct(product, storeOrigin) : null;
    },

    async getProducts(options: GetProductsOptions = {}): Promise<Product[]> {
      let products = await listVisibleProducts(client);

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
      const products = await listVisibleProducts(client);
      const tagged = products.filter((product) =>
        (product.tags ?? []).includes(collection),
      );
      return finish(tagged, { sortKey, reverse });
    },
  };
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
