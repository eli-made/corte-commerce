import { requireConfig } from "@corte-so/commerce-core";
import { normalizeStoreDomain } from "../catalog.js";
import { API_KEY_ENV, STORE_DOMAIN_ENV } from "../constants.js";
import { ambientEnv } from "../env.js";
import {
  createSquarespaceClient,
  type FetchLike,
  type SquarespaceClient,
} from "../fetch.js";

export type SquarespaceAgentClientConfig = {
  /**
   * Squarespace API key. Needs **Products** read (plus write to use
   * `update_product`) and **Orders** read — the same key the catalog provider
   * takes, with the extra permissions granted at mint time.
   */
  apiKey: string;
  /** Merchant storefront domain, e.g. "shop.example.com". Used only to
   * absolutize product `externalUrl`s, exactly as the catalog provider does. */
  storeDomain?: string;
  /** Injected for tests and non-global-fetch runtimes. */
  fetch?: FetchLike;
};

/**
 * The catalog provider's HTTP client plus the store origin the backend needs
 * for `externalUrl`. Built once and closed over by the backend, so the API key
 * lives in one closure and never travels through a tool argument.
 */
export type SquarespaceAgentClient = SquarespaceClient & {
  readonly storeOrigin?: string;
};

export function createSquarespaceAgentClient(
  config: SquarespaceAgentClientConfig,
): SquarespaceAgentClient {
  const http = createSquarespaceClient({
    apiKey: config.apiKey,
    fetch: config.fetch,
  });
  const storeOrigin = normalizeStoreDomain(config.storeDomain);
  return { ...http, ...(storeOrigin ? { storeOrigin } : {}) };
}

/**
 * Build an agent client from environment variables: `SQUARESPACE_API_TOKEN`
 * (required) and `SQUARESPACE_STORE_DOMAIN` (optional) — the same pair the
 * catalog provider reads. The env record is read when this is called, never at
 * module load.
 */
export function squarespaceAgentClientFromEnv(
  env: Record<string, string | undefined> = ambientEnv(),
): SquarespaceAgentClient {
  return createSquarespaceAgentClient({
    apiKey: requireConfig(env, API_KEY_ENV),
    storeDomain: env[STORE_DOMAIN_ENV],
  });
}
