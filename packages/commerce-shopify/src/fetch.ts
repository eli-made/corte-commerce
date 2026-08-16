import { CommerceApiError } from "@corte-so/commerce-core";
import type { ResolvedShopifyConfig } from "./config.js";

const PROVIDER_ID = "shopify";

export type ShopifyGraphQL = <TData>(
  query: string,
  variables?: Record<string, unknown>,
) => Promise<TData>;

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
 * A GraphQL caller bound to one store. Resolves to the `data` object; every
 * failure mode — transport, HTTP status, GraphQL `errors`, missing `data` —
 * becomes a `CommerceApiError`.
 */
export function createShopifyGraphQL(config: ResolvedShopifyConfig): ShopifyGraphQL {
  const { endpoint, storefrontAccessToken, fetch: doFetch } = config;

  return async function shopifyGraphQL<TData>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<TData> {
    let response: Response;
    try {
      response = await doFetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": storefrontAccessToken,
        },
        body: JSON.stringify(variables ? { query, variables } : { query }),
      });
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new CommerceApiError(
        PROVIDER_ID,
        0,
        redact(`Request to ${endpoint} failed: ${detail}`, storefrontAccessToken),
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
        `Storefront API returned a non-JSON body (HTTP ${status})`,
      );
    }

    if (!response.ok) {
      const detail = collectErrors(envelope.errors) ?? `HTTP ${status}`;
      throw new CommerceApiError(
        PROVIDER_ID,
        status,
        redact(detail, storefrontAccessToken),
      );
    }

    const errorMessage = collectErrors(envelope.errors);
    if (errorMessage !== undefined) {
      throw new CommerceApiError(
        PROVIDER_ID,
        status,
        redact(errorMessage, storefrontAccessToken),
      );
    }

    if (envelope.data === undefined || envelope.data === null) {
      throw new CommerceApiError(
        PROVIDER_ID,
        status,
        "Storefront API response contained no data",
      );
    }

    return envelope.data;
  };
}
