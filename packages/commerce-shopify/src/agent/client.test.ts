import { CommerceApiError, CommerceConfigError } from "@corte-so/commerce-core";
import { describe, expect, it } from "vitest";
import { DEFAULT_SHOPIFY_API_VERSION } from "../config.js";
import {
  createShopifyAdminClient,
  shopifyAdminClientFromEnv,
} from "./client.js";

const TOKEN = "shpat_admin_test_token";
const STORE = "acme.myshopify.com";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createShopifyAdminClient", () => {
  it("posts to the versioned Admin endpoint with the access-token header", async () => {
    let seenUrl = "";
    let seenHeaders: Record<string, string> = {};
    let seenBody: unknown;

    const client = createShopifyAdminClient({
      storeDomain: "https://acme.myshopify.com/",
      accessToken: TOKEN,
      apiVersion: "2025-10",
      fetch: async (input, init) => {
        seenUrl = String(input);
        seenHeaders = (init?.headers ?? {}) as Record<string, string>;
        seenBody = JSON.parse(String(init?.body ?? "{}"));
        return jsonResponse({ data: { ok: true } });
      },
    });

    await expect(client.graphql("query { ok }", { a: 1 })).resolves.toEqual({
      ok: true,
    });
    expect(seenUrl).toBe("https://acme.myshopify.com/admin/api/2025-10/graphql.json");
    expect(seenHeaders["X-Shopify-Access-Token"]).toBe(TOKEN);
    expect(seenHeaders["Content-Type"]).toBe("application/json");
    expect(seenBody).toEqual({ query: "query { ok }", variables: { a: 1 } });
  });

  it("defaults to the package's API version and exposes the normalized store url", () => {
    const client = createShopifyAdminClient({
      storeDomain: "acme.myshopify.com/",
      accessToken: TOKEN,
      fetch: async () => jsonResponse({ data: {} }),
    });

    expect(client.apiVersion).toBe(DEFAULT_SHOPIFY_API_VERSION);
    expect(client.storeUrl).toBe("https://acme.myshopify.com");
  });

  it("rejects an empty access token before making a request", () => {
    expect(() =>
      createShopifyAdminClient({
        storeDomain: STORE,
        accessToken: "",
        fetch: async () => jsonResponse({ data: {} }),
      }),
    ).toThrow(CommerceConfigError);
  });

  it("turns GraphQL errors into CommerceApiError without leaking the token", async () => {
    const client = createShopifyAdminClient({
      storeDomain: STORE,
      accessToken: TOKEN,
      fetch: async () => jsonResponse({ errors: `[API] bad token ${TOKEN}` }),
    });

    const error = await client.graphql("query { ok }").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CommerceApiError);
    expect((error as CommerceApiError).provider).toBe("shopify");
    expect((error as CommerceApiError).message).toContain("[redacted]");
    expect((error as CommerceApiError).message).not.toContain(TOKEN);
  });

  it("carries the HTTP status through on non-2xx responses", async () => {
    const client = createShopifyAdminClient({
      storeDomain: STORE,
      accessToken: TOKEN,
      fetch: async () =>
        jsonResponse({ errors: [{ message: "Throttled" }] }, 429),
    });

    const error = await client.graphql("query { ok }").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CommerceApiError);
    expect((error as CommerceApiError).status).toBe(429);
    expect((error as CommerceApiError).message).toContain("Throttled");
  });

  it("reports a transport failure as status 0 with the endpoint named", async () => {
    const client = createShopifyAdminClient({
      storeDomain: STORE,
      accessToken: TOKEN,
      fetch: async () => {
        throw new Error("socket hang up");
      },
    });

    const error = await client.graphql("query { ok }").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CommerceApiError);
    expect((error as CommerceApiError).status).toBe(0);
    expect((error as CommerceApiError).message).toContain("socket hang up");
  });

  it("rejects a response with no data", async () => {
    const client = createShopifyAdminClient({
      storeDomain: STORE,
      accessToken: TOKEN,
      fetch: async () => jsonResponse({}),
    });

    await expect(client.graphql("query { ok }")).rejects.toBeInstanceOf(
      CommerceApiError,
    );
  });
});

describe("shopifyAdminClientFromEnv", () => {
  it("builds a client from the admin env contract", () => {
    const client = shopifyAdminClientFromEnv(
      {
        SHOPIFY_STORE_DOMAIN: STORE,
        SHOPIFY_ADMIN_ACCESS_TOKEN: TOKEN,
        SHOPIFY_API_VERSION: "2025-07",
      },
      { fetch: async () => jsonResponse({ data: {} }) },
    );

    expect(client.storeUrl).toBe("https://acme.myshopify.com");
    expect(client.apiVersion).toBe("2025-07");
  });

  it("fails by name when the admin token is missing", () => {
    expect(() =>
      shopifyAdminClientFromEnv({ SHOPIFY_STORE_DOMAIN: STORE }),
    ).toThrow(/Missing required configuration: SHOPIFY_ADMIN_ACCESS_TOKEN/);
  });

  it("fails by name when the store domain is missing", () => {
    expect(() =>
      shopifyAdminClientFromEnv({ SHOPIFY_ADMIN_ACCESS_TOKEN: TOKEN }),
    ).toThrow(/Missing required configuration: SHOPIFY_STORE_DOMAIN/);
  });

  it("does not read the storefront token", () => {
    expect(() =>
      shopifyAdminClientFromEnv({
        SHOPIFY_STORE_DOMAIN: STORE,
        SHOPIFY_STOREFRONT_ACCESS_TOKEN: "shpat_storefront",
      }),
    ).toThrow(CommerceConfigError);
  });
});
