import { CommerceApiError } from "@corte-so/commerce-core";

export const PROVIDER_ID = "bigcommerce";

/** Default host the canonical store domain lives on. */
const DEFAULT_STORE_DOMAIN = "mybigcommerce.com";
/** Default host for the store management (v3 REST) API. */
const DEFAULT_API_URL = "https://api.bigcommerce.com";

export type BigCommerceConfig = {
  /** Store hash from the store's API path, e.g. `abc123` in `store-abc123`. */
  storeHash: string;
  /** Storefront channel. Channel 1 is the default storefront and adds no
   * segment to the GraphQL host; any other channel does. */
  channelId?: string;
  /** Storefront API token, minted as a "customer impersonation" token. */
  customerImpersonationToken: string;
  /** Public storefront origin, e.g. `https://store.example.com`. Used to build
   * `Product.externalUrl`. */
  storefrontUrl?: string;
  /**
   * Optional store-level API account token (v3 REST). When present, checkout
   * URLs are resolved through `POST /v3/carts/{id}/redirect_urls` instead of
   * the Storefront GraphQL redirect-URL mutation.
   */
  accessToken?: string;
  /** Override the store management API host. */
  apiUrl?: string;
  /** Override the canonical store domain (e.g. for a sandbox environment). */
  storeDomain?: string;
  /** Injected fetch — defaults to the global one. */
  fetch?: typeof fetch;
};

/** GraphQL endpoint for a store/channel pair. */
export function storefrontEndpoint(config: BigCommerceConfig): string {
  const channelSegment =
    config.channelId !== undefined && config.channelId.trim() !== "" &&
    Number(config.channelId) !== 1
      ? `-${config.channelId}`
      : "";
  const domain = config.storeDomain ?? DEFAULT_STORE_DOMAIN;

  return `https://store-${config.storeHash}${channelSegment}.${domain}/graphql`;
}

/** Base URL for this store's v3 REST resources. */
export function managementApiBase(config: BigCommerceConfig): string {
  return `${config.apiUrl ?? DEFAULT_API_URL}/stores/${config.storeHash}`;
}

type GraphQLResponse<TData> = {
  data?: TData;
  errors?: Array<{ message?: string }>;
};

export type BigCommerceFetcher = {
  /** Execute a Storefront GraphQL document and return its `data`. */
  graphql<TData>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<TData>;
  /** Execute a store management (v3 REST) request. Requires `accessToken`. */
  rest<TResult>(
    path: string,
    init?: { method?: string; body?: string },
  ): Promise<TResult>;
  readonly config: BigCommerceConfig;
};

export function createFetcher(config: BigCommerceConfig): BigCommerceFetcher {
  const doFetch = config.fetch ?? globalThis.fetch;
  const endpoint = storefrontEndpoint(config);

  // Belt-and-braces: no error surfaced by this package may echo a credential,
  // whatever an upstream response body happens to contain.
  const redact = (text: string): string => {
    let safe = text.split(config.customerImpersonationToken).join("[redacted]");
    if (config.accessToken) {
      safe = safe.split(config.accessToken).join("[redacted]");
    }
    return safe;
  };

  const fail = (status: number, message: string): never => {
    throw new CommerceApiError(PROVIDER_ID, status, redact(message));
  };

  const readBody = async (response: Response): Promise<string> => {
    try {
      const text = await response.text();
      return text.slice(0, 500);
    } catch {
      return "";
    }
  };

  return {
    config,

    async graphql<TData>(
      query: string,
      variables?: Record<string, unknown>,
    ): Promise<TData> {
      let response: Response;

      try {
        response = await doFetch(endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${config.customerImpersonationToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(variables ? { query, variables } : { query }),
        });
      } catch (error) {
        // Status 0: the request never reached BigCommerce.
        return fail(
          0,
          `Storefront request failed: ${(error as Error)?.message ?? "network error"}`,
        );
      }

      if (!response.ok) {
        const body = await readBody(response);
        return fail(
          response.status,
          `Storefront request failed with status ${response.status}${body ? `: ${body}` : ""}`,
        );
      }

      let payload: GraphQLResponse<TData>;
      try {
        payload = (await response.json()) as GraphQLResponse<TData>;
      } catch {
        return fail(response.status, "Storefront response was not valid JSON");
      }

      if (payload.errors && payload.errors.length > 0) {
        const message = payload.errors
          .map((error) => error.message ?? "unknown GraphQL error")
          .join("; ");
        return fail(response.status, message);
      }

      if (!payload.data) {
        return fail(response.status, "Storefront response contained no data");
      }

      return payload.data;
    },

    async rest<TResult>(
      path: string,
      init?: { method?: string; body?: string },
    ): Promise<TResult> {
      if (!config.accessToken) {
        return fail(
          0,
          `Store management request to ${path} requires an access token`,
        );
      }

      const url = `${managementApiBase(config)}${path}`;
      let response: Response;

      try {
        response = await doFetch(url, {
          method: init?.method ?? "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Auth-Token": config.accessToken,
          },
          ...(init?.body ? { body: init.body } : {}),
        });
      } catch (error) {
        return fail(
          0,
          `Store management request failed: ${(error as Error)?.message ?? "network error"}`,
        );
      }

      if (!response.ok) {
        const body = await readBody(response);
        return fail(
          response.status,
          `Store management request failed with status ${response.status}${body ? `: ${body}` : ""}`,
        );
      }

      try {
        return (await response.json()) as TResult;
      } catch {
        return fail(
          response.status,
          "Store management response was not valid JSON",
        );
      }
    },
  };
}
