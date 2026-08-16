export const PROVIDER_ID = "squarespace";

export const API_ORIGIN = "https://api.squarespace.com";

export const PRODUCTS_PATH = "/1.0/commerce/products";

/** Env var holding a Squarespace API key with the "Products (read)" scope. */
export const API_KEY_ENV = "SQUARESPACE_API_TOKEN";

/** Optional env var naming the merchant's storefront domain. Used only to
 * absolutize `Product.externalUrl`. */
export const STORE_DOMAIN_ENV = "SQUARESPACE_STORE_DOMAIN";

/**
 * Safety stop for cursor pagination. The catalog endpoint returns pages of up
 * to 50 products, so this covers ~2,500 products; beyond it we stop rather
 * than loop forever against a misbehaving cursor. Catalogs larger than this
 * should be served by a provider with real server-side search and paging.
 */
export const MAX_PRODUCT_PAGES = 50;
