import {
  CommerceApiError,
  CommerceConfigError,
  requireConfig,
} from "@corte-so/commerce-core";
import {
  DEFAULT_SHOPIFY_API_VERSION,
  normalizeStoreDomain,
  SHOPIFY_API_VERSION_ENV,
  SHOPIFY_STORE_DOMAIN_ENV,
} from "../config.js";

const PROVIDER_ID = "shopify";

/** Admin API access token — a *different* credential class from the storefront
 * token: it is secret, server-only, and carries write scopes. */
export const SHOPIFY_ADMIN_ACCESS_TOKEN_ENV = "SHOPIFY_ADMIN_ACCESS_TOKEN";

export type ShopifyAdminClientConfig = {
  /** Store domain, with or without protocol: "acme.myshopify.com". */
  storeDomain: string;
  /** Admin API access token (`shpat_…`). Never leaves this process. */
  accessToken: string;
  /** Admin API version; defaults to the package's storefront version so both
   * halves of the package move together. */
  apiVersion?: string;
  /** Injected fetch — for tests, or a runtime with a non-global fetch. */
  fetch?: typeof fetch;
};

/**
 * A GraphQL caller bound to one store's Admin API, plus the normalized store
 * origin the backend needs to build storefront links. Backends close over this
 * so a credential never travels in tool arguments.
 */
export type ShopifyAdminClient = {
  /** Normalized origin, e.g. "https://acme.myshopify.com" — no trailing slash. */
  readonly storeUrl: string;
  readonly apiVersion: string;
  graphql<TData>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<TData>;
};

type GraphQLEnvelope<TData> = {
  data?: TData;
  /** Usually `[{ message }]`; auth failures come back as a bare string. */
  errors?: unknown;
};

/** Never let the access token reach a log line or an error message. */
function redact(message: string, token: string): string {
  return token ? message.split(token).join("[redacted]") : message;
}

function collectErrors(errors: unknown): string | undefined {
  if (typeof errors === "string") return errors === "" ? undefined : errors;

  const list = Array.isArray(errors) ? errors : errors ? [errors] : [];
  const messages = list
    .map((error) => (error as { message?: unknown } | null)?.message)
    .filter(
      (message): message is string =>
        typeof message === "string" && message !== "",
    );
  return messages.length > 0 ? messages.join("; ") : undefined;
}

/**
 * Build an Admin API client. Config is injected — nothing here reads env vars
 * or any other ambient state.
 *
 * The Admin transport is deliberately separate from `fetch.ts`'s storefront
 * caller: different endpoint path, different auth header, and different
 * failure vocabulary (mutations report `userErrors` inside a 200 response).
 */
export function createShopifyAdminClient(
  config: ShopifyAdminClientConfig,
): ShopifyAdminClient {
  const storeUrl = normalizeStoreDomain(config.storeDomain);

  if (!config.accessToken) {
    throw new CommerceConfigError("accessToken must not be empty");
  }

  const apiVersion = config.apiVersion ?? DEFAULT_SHOPIFY_API_VERSION;
  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new CommerceConfigError(
      "No fetch implementation available — pass `fetch` in the client config",
    );
  }
  // Unbind from `globalThis` so runtimes that check the receiver stay happy.
  const doFetch: typeof fetch = (...args) => fetchImpl(...args);

  const endpoint = `${storeUrl}/admin/api/${apiVersion}/graphql.json`;
  const { accessToken } = config;

  return {
    storeUrl,
    apiVersion,

    async graphql<TData>(
      query: string,
      variables?: Record<string, unknown>,
    ): Promise<TData> {
      let response: Response;
      try {
        response = await doFetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
          body: JSON.stringify(variables ? { query, variables } : { query }),
        });
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        throw new CommerceApiError(
          PROVIDER_ID,
          0,
          redact(`Request to ${endpoint} failed: ${detail}`, accessToken),
        );
      }

      const status = response.status;
      const raw = await response.text();

      let envelope: GraphQLEnvelope<TData>;
      try {
        envelope = raw === "" ? {} : (JSON.parse(raw) as GraphQLEnvelope<TData>);
      } catch {
        throw new CommerceApiError(
          PROVIDER_ID,
          status,
          `Admin API returned a non-JSON body (HTTP ${status})`,
        );
      }

      if (!response.ok) {
        const detail = collectErrors(envelope.errors) ?? `HTTP ${status}`;
        throw new CommerceApiError(
          PROVIDER_ID,
          status,
          redact(detail, accessToken),
        );
      }

      const errorMessage = collectErrors(envelope.errors);
      if (errorMessage !== undefined) {
        throw new CommerceApiError(
          PROVIDER_ID,
          status,
          redact(errorMessage, accessToken),
        );
      }

      if (envelope.data === undefined || envelope.data === null) {
        throw new CommerceApiError(
          PROVIDER_ID,
          status,
          "Admin API response contained no data",
        );
      }

      return envelope.data;
    },
  };
}

/** `process.env` where there is a process, `{}` where there isn't (Workers,
 * browsers). Read lazily — never at module scope. */
function ambientEnv(): Record<string, string | undefined> {
  const proc = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process;
  return proc?.env ?? {};
}

/**
 * Convenience wrapper reading `SHOPIFY_STORE_DOMAIN`,
 * `SHOPIFY_ADMIN_ACCESS_TOKEN`, and the optional `SHOPIFY_API_VERSION`.
 * Missing required keys fail by name rather than producing an
 * unauthenticated request.
 */
export function shopifyAdminClientFromEnv(
  env: Record<string, string | undefined> = ambientEnv(),
  overrides?: Pick<ShopifyAdminClientConfig, "fetch">,
): ShopifyAdminClient {
  return createShopifyAdminClient({
    storeDomain: requireConfig(env, SHOPIFY_STORE_DOMAIN_ENV),
    accessToken: requireConfig(env, SHOPIFY_ADMIN_ACCESS_TOKEN_ENV),
    apiVersion: env[SHOPIFY_API_VERSION_ENV] || undefined,
    ...overrides,
  });
}
