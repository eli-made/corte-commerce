import { describe, expect, it } from "vitest";
import { createShopifyProvider } from "./provider.js";

const SECRET = "s3cret";

function webhooks(revalidationSecret?: string) {
  return createShopifyProvider({
    storeDomain: "acme.myshopify.com",
    storefrontAccessToken: "shpat-test-token",
    revalidationSecret,
    fetch: async () => new Response("{}"),
  }).webhooks!;
}

const params = (secret?: string) =>
  new URLSearchParams(secret === undefined ? "" : `secret=${secret}`);

describe("webhooks.classify", () => {
  it("classifies product topics", () => {
    for (const topic of ["products/create", "products/update", "products/delete"]) {
      expect(
        webhooks(SECRET).classify({
          headers: { "x-shopify-topic": topic },
          searchParams: params(SECRET),
        }),
      ).toEqual({ scope: "products" });
    }
  });

  it("classifies collection topics", () => {
    expect(
      webhooks(SECRET).classify({
        headers: { "x-shopify-topic": "collections/update" },
        searchParams: params(SECRET),
      }),
    ).toEqual({ scope: "collections" });
  });

  it("matches the topic header case-insensitively", () => {
    expect(
      webhooks(SECRET).classify({
        headers: { "X-Shopify-Topic": "products/update" },
        searchParams: params(SECRET),
      }),
    ).toEqual({ scope: "products" });
  });

  it("returns null for a wrong or missing secret", () => {
    expect(
      webhooks(SECRET).classify({
        headers: { "x-shopify-topic": "products/update" },
        searchParams: params("wrong"),
      }),
    ).toBeNull();

    expect(
      webhooks(SECRET).classify({
        headers: { "x-shopify-topic": "products/update" },
        searchParams: params(),
      }),
    ).toBeNull();

    expect(
      webhooks(SECRET).classify({ headers: { "x-shopify-topic": "products/update" } }),
    ).toBeNull();
  });

  it("refuses everything when no secret is configured", () => {
    expect(
      webhooks(undefined).classify({
        headers: { "x-shopify-topic": "products/update" },
        searchParams: params(SECRET),
      }),
    ).toBeNull();
  });

  it("returns null for topics that need no revalidation", () => {
    expect(
      webhooks(SECRET).classify({
        headers: { "x-shopify-topic": "orders/create" },
        searchParams: params(SECRET),
      }),
    ).toBeNull();

    expect(webhooks(SECRET).classify({ headers: {}, searchParams: params(SECRET) })).toBeNull();
  });
});
