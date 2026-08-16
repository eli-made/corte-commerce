import { CommerceConfigError } from "@corte-so/commerce-core";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHOPIFY_API_VERSION,
  normalizeStoreDomain,
  shopifyConfigFromEnv,
} from "./config.js";
import { createShopifyProvider, shopifyProviderFromEnv } from "./provider.js";

describe("normalizeStoreDomain", () => {
  it("accepts a bare domain, a protocol, and a trailing slash", () => {
    for (const input of [
      "acme.myshopify.com",
      "https://acme.myshopify.com",
      "https://acme.myshopify.com/",
      "  acme.myshopify.com  ",
    ]) {
      expect(normalizeStoreDomain(input)).toBe("https://acme.myshopify.com");
    }
  });

  it("keeps an explicit http:// (local mock stores)", () => {
    expect(normalizeStoreDomain("http://localhost:4000/")).toBe("http://localhost:4000");
  });

  it("rejects an empty domain", () => {
    expect(() => normalizeStoreDomain("   ")).toThrow(CommerceConfigError);
  });
});

describe("shopifyConfigFromEnv", () => {
  it("reads the documented variables", () => {
    const config = shopifyConfigFromEnv({
      SHOPIFY_STORE_DOMAIN: "acme.myshopify.com",
      SHOPIFY_STOREFRONT_ACCESS_TOKEN: "shpat-abc",
      SHOPIFY_REVALIDATION_SECRET: "s3cret",
    });

    expect(config).toEqual({
      storeDomain: "acme.myshopify.com",
      storefrontAccessToken: "shpat-abc",
      revalidationSecret: "s3cret",
      apiVersion: undefined,
    });
  });

  it("names the missing variable when a required key is absent", () => {
    expect(() =>
      shopifyConfigFromEnv({ SHOPIFY_STORE_DOMAIN: "acme.myshopify.com" }),
    ).toThrow(/SHOPIFY_STOREFRONT_ACCESS_TOKEN/);

    expect(() => shopifyConfigFromEnv({})).toThrow(CommerceConfigError);
    expect(() => shopifyConfigFromEnv({})).toThrow(/SHOPIFY_STORE_DOMAIN/);
  });

  it("builds a working provider from an env record", async () => {
    let endpoint = "";
    const provider = shopifyProviderFromEnv(
      {
        SHOPIFY_STORE_DOMAIN: "acme.myshopify.com",
        SHOPIFY_STOREFRONT_ACCESS_TOKEN: "shpat-abc",
      },
      {
        fetch: async (input) => {
          endpoint = String(input);
          return new Response(JSON.stringify({ data: { products: { edges: [] } } }));
        },
      },
    );

    await provider.getProducts();
    expect(endpoint).toBe(
      `https://acme.myshopify.com/api/${DEFAULT_SHOPIFY_API_VERSION}/graphql.json`,
    );
  });
});

describe("createShopifyProvider validation", () => {
  it("rejects an empty access token", () => {
    expect(() =>
      createShopifyProvider({
        storeDomain: "acme.myshopify.com",
        storefrontAccessToken: "",
        fetch: async () => new Response("{}"),
      }),
    ).toThrow(CommerceConfigError);
  });
});
