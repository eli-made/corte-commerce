export const PROVIDER_ID = "squarespace";

export const API_ORIGIN = "https://api.squarespace.com";

export const PRODUCTS_PATH = "/1.0/commerce/products";

/**
 * Products API v2. Reads stay on 1.0 (the shape every mapper here is written
 * against); only the documented product *update* endpoint lives here, because
 * v2 is the version whose update request body Squarespace documents.
 * See https://developers.squarespace.com/commerce-apis/update-product.
 */
export const PRODUCTS_V2_PATH = "/v2/commerce/products";

/** Orders API, current version 1.0.
 * See https://developers.squarespace.com/commerce-apis/retrieve-all-orders. */
export const ORDERS_PATH = "/1.0/commerce/orders";

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

/**
 * Safety stop for order cursor pagination. Orders come back newest-modified
 * first, 50 to a page, and the agent tool asks for at most 50 — pages are only
 * walked when a client-side status filter thins the results, so 10 pages (~500
 * orders scanned) is plenty and still bounded.
 */
export const MAX_ORDER_PAGES = 10;
