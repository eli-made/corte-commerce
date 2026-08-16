import { CommerceConfigError, requireConfig } from "@corte-so/commerce-core";

/**
 * Storefront API version used when the caller doesn't pin one. Shopify ships a
 * new version every quarter and supports each for at least a year; bump this
 * deliberately, or pass `apiVersion` to pin a store to a known-good version.
 */
export const DEFAULT_SHOPIFY_API_VERSION = "2025-10";

export type ShopifyProviderConfig = {
  /** Store domain, with or without protocol: "acme.myshopify.com" or
   * "https://acme.myshopify.com/". A custom primary domain works too. */
  storeDomain: string;
  /** Storefront API access token (public, scoped to the storefront). */
  storefrontAccessToken: string;
  /** Shared secret expected in the `?secret=` query param of webhook calls.
   * Without it `webhooks.classify` refuses every request. */
  revalidationSecret?: string;
  /** Storefront API version, e.g. "2025-10". */
  apiVersion?: string;
  /** Injected fetch — for tests, or for a runtime with a non-global fetch. */
  fetch?: typeof fetch;
};

export type ResolvedShopifyConfig = {
  /** Normalized origin, e.g. "https://acme.myshopify.com" — no trailing slash. */
  storeUrl: string;
  storefrontAccessToken: string;
  revalidationSecret?: string;
  apiVersion: string;
  endpoint: string;
  fetch: typeof fetch;
};

/**
 * Accept a domain with or without a protocol, with or without a trailing
 * slash, and reduce it to a bare origin.
 */
export function normalizeStoreDomain(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") {
    throw new CommerceConfigError("storeDomain must not be empty");
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new CommerceConfigError(`storeDomain is not a valid domain: ${input}`);
  }
  if (url.host === "") {
    throw new CommerceConfigError(`storeDomain is not a valid domain: ${input}`);
  }

  return `${url.protocol}//${url.host}`;
}

export function resolveConfig(config: ShopifyProviderConfig): ResolvedShopifyConfig {
  const storeUrl = normalizeStoreDomain(config.storeDomain);

  if (!config.storefrontAccessToken) {
    throw new CommerceConfigError("storefrontAccessToken must not be empty");
  }

  const apiVersion = config.apiVersion ?? DEFAULT_SHOPIFY_API_VERSION;
  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new CommerceConfigError(
      "No fetch implementation available — pass `fetch` in the provider config",
    );
  }

  return {
    storeUrl,
    storefrontAccessToken: config.storefrontAccessToken,
    revalidationSecret: config.revalidationSecret,
    apiVersion,
    endpoint: `${storeUrl}/api/${apiVersion}/graphql.json`,
    // Unbind from `globalThis` so runtimes that check the receiver stay happy.
    fetch: (...args: Parameters<typeof fetch>) => fetchImpl(...args),
  };
}

export const SHOPIFY_STORE_DOMAIN_ENV = "SHOPIFY_STORE_DOMAIN";
export const SHOPIFY_STOREFRONT_ACCESS_TOKEN_ENV =
  "SHOPIFY_STOREFRONT_ACCESS_TOKEN";
export const SHOPIFY_REVALIDATION_SECRET_ENV = "SHOPIFY_REVALIDATION_SECRET";
export const SHOPIFY_API_VERSION_ENV = "SHOPIFY_API_VERSION";

/** `process.env` where there is a process, `{}` where there isn't (Workers,
 * browsers). Read lazily — never at module scope. */
function ambientEnv(): Record<string, string | undefined> {
  const proc = (globalThis as {
    process?: { env?: Record<string, string | undefined> };
  }).process;
  return proc?.env ?? {};
}

/**
 * Build a config from an env-like record. Missing required keys fail by name
 * via core's `requireConfig` rather than producing an unauthenticated request.
 */
export function shopifyConfigFromEnv(
  env: Record<string, string | undefined> = ambientEnv(),
): ShopifyProviderConfig {
  return {
    storeDomain: requireConfig(env, SHOPIFY_STORE_DOMAIN_ENV),
    storefrontAccessToken: requireConfig(env, SHOPIFY_STOREFRONT_ACCESS_TOKEN_ENV),
    revalidationSecret: env[SHOPIFY_REVALIDATION_SECRET_ENV] || undefined,
    apiVersion: env[SHOPIFY_API_VERSION_ENV] || undefined,
  };
}
