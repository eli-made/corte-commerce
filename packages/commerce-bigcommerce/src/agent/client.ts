import { CommerceApiError, requireConfig } from "@corte-so/commerce-core";

import { PROVIDER_ID } from "../fetch.js";

/** Default host for the store management APIs (v2 and v3 alike). */
const DEFAULT_API_URL = "https://api.bigcommerce.com";

export type BigCommerceAdminConfig = {
  /** Store hash from the store's API path, e.g. `abc123` in `store-abc123`. */
  storeHash: string;
  /**
   * Store-level API account token, sent as `X-Auth-Token`. This is *not* the
   * storefront customer-impersonation token the catalog provider uses.
   */
  accessToken: string;
  /** Public storefront origin, e.g. `https://store.example.com`. Used to build
   * `externalUrl`; without it products report no storefront link. */
  storefrontUrl?: string;
  /**
   * Currency to label catalog prices with. v3 catalog prices are bare numbers
   * in the store's default currency and carry no code, so it has to be told —
   * unset means prices are reported with an empty `currencyCode`. Orders are
   * unaffected: v2 orders carry their own `currency_code`.
   */
  currencyCode?: string;
  /** Override the management API host. */
  apiUrl?: string;
  /** Injected fetch — defaults to the global one. */
  fetch?: typeof fetch;
};

export type BigCommerceAdminRequest = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Query parameters; `undefined` values are dropped. */
  query?: Record<string, string | number | boolean | undefined>;
  /** JSON request body. */
  body?: unknown;
};

export interface BigCommerceAdminClient {
  readonly storeHash: string;
  readonly storefrontUrl: string | undefined;
  /** Currency code catalog prices are labelled with; `""` when unconfigured. */
  readonly currencyCode: string;
  /** Perform a request, throwing `CommerceApiError` on anything but 2xx. */
  request<TResult>(
    path: string,
    init?: BigCommerceAdminRequest,
  ): Promise<TResult>;
  /**
   * As `request`, but resolves `null` instead of throwing when the resource is
   * absent: a 404, or an empty body — the v2 API answers "no results" with a
   * 204, not an empty array.
   */
  requestOrNull<TResult>(
    path: string,
    init?: BigCommerceAdminRequest,
  ): Promise<TResult | null>;
}

const buildQuery = (query: BigCommerceAdminRequest["query"]): string => {
  if (!query) return "";

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
};

/**
 * Client for BigCommerce's store management REST APIs, the surface the agent
 * backend is built on. Catalog writes and order reads are not available to the
 * Storefront GraphQL API at all, which is why this exists alongside
 * `createFetcher`.
 */
export function createBigCommerceAdminClient(
  config: BigCommerceAdminConfig,
): BigCommerceAdminClient {
  const doFetch = config.fetch ?? globalThis.fetch;
  const base = `${config.apiUrl ?? DEFAULT_API_URL}/stores/${config.storeHash}`;

  // Belt-and-braces: no error surfaced by this client may echo the token,
  // whatever an upstream response body happens to contain.
  const redact = (text: string): string =>
    config.accessToken
      ? text.split(config.accessToken).join("[redacted]")
      : text;

  const fail = (status: number, message: string): never => {
    throw new CommerceApiError(PROVIDER_ID, status, redact(message));
  };

  const send = async (
    path: string,
    init: BigCommerceAdminRequest = {},
  ): Promise<Response> => {
    const url = `${base}${path}${buildQuery(init.query)}`;

    try {
      return await doFetch(url, {
        method: init.method ?? "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Auth-Token": config.accessToken,
        },
        ...(init.body === undefined
          ? {}
          : { body: JSON.stringify(init.body) }),
      });
    } catch (error) {
      // Status 0: the request never reached BigCommerce.
      return fail(
        0,
        `Store management request failed: ${(error as Error)?.message ?? "network error"}`,
      );
    }
  };

  const readBody = async (response: Response): Promise<string> => {
    try {
      return await response.text();
    } catch {
      return "";
    }
  };

  /** Error messages quote at most the head of a body — never the whole thing. */
  const excerpt = (body: string): string => body.slice(0, 500);

  const parse = <TResult>(
    text: string,
    status: number,
    path: string,
  ): TResult => {
    try {
      return JSON.parse(text) as TResult;
    } catch {
      return fail(status, `Store management response to ${path} was not valid JSON`);
    }
  };

  const requestOrNull = async <TResult>(
    path: string,
    init?: BigCommerceAdminRequest,
  ): Promise<TResult | null> => {
    const response = await send(path, init);

    if (response.status === 404) return null;

    if (!response.ok) {
      const body = excerpt(await readBody(response));
      return fail(
        response.status,
        `Store management request to ${path} failed with status ${response.status}${body ? `: ${body}` : ""}`,
      );
    }

    const text = await readBody(response);
    if (text.trim() === "") return null;

    return parse<TResult>(text, response.status, path);
  };

  return {
    storeHash: config.storeHash,
    storefrontUrl: config.storefrontUrl,
    currencyCode: config.currencyCode ?? "",

    async request<TResult>(
      path: string,
      init?: BigCommerceAdminRequest,
    ): Promise<TResult> {
      const result = await requestOrNull<TResult>(path, init);

      if (result === null) {
        return fail(404, `Store management request to ${path} returned no data`);
      }

      return result;
    },

    requestOrNull,
  };
}

/**
 * Build an admin client from environment variables.
 *
 * Required: `BIGCOMMERCE_STORE_HASH`, `BIGCOMMERCE_ACCESS_TOKEN`.
 * Optional: `BIGCOMMERCE_STOREFRONT_URL`, `BIGCOMMERCE_CURRENCY_CODE`,
 * `BIGCOMMERCE_API_URL`.
 */
export function bigCommerceAdminClientFromEnv(
  env: Record<string, string | undefined> = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env ?? {},
  overrides: Partial<BigCommerceAdminConfig> = {},
): BigCommerceAdminClient {
  return createBigCommerceAdminClient({
    storeHash: requireConfig(env, "BIGCOMMERCE_STORE_HASH"),
    accessToken: requireConfig(env, "BIGCOMMERCE_ACCESS_TOKEN"),
    ...(env.BIGCOMMERCE_STOREFRONT_URL
      ? { storefrontUrl: env.BIGCOMMERCE_STOREFRONT_URL }
      : {}),
    ...(env.BIGCOMMERCE_CURRENCY_CODE
      ? { currencyCode: env.BIGCOMMERCE_CURRENCY_CODE }
      : {}),
    ...(env.BIGCOMMERCE_API_URL ? { apiUrl: env.BIGCOMMERCE_API_URL } : {}),
    ...overrides,
  });
}
