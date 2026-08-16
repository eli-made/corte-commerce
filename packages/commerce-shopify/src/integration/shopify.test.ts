/**
 * Live Storefront API checks. Read-only and deliberately light — they exist to
 * catch API-version drift and credential/shape breakage, not to assert on any
 * particular store's catalog.
 *
 * Run with:
 *   COMMERCE_INTEGRATION=1 SHOPIFY_STORE_DOMAIN=... \
 *   SHOPIFY_STOREFRONT_ACCESS_TOKEN=... npx vitest run packages/commerce-shopify
 */
import { assertProviderShape } from "@corte-so/commerce-core";
import { describe, expect, it } from "vitest";
import { shopifyProviderFromEnv } from "../provider.js";

const configured =
  Boolean(process.env.SHOPIFY_STORE_DOMAIN) &&
  Boolean(process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN);

describe.skipIf(!configured)("shopify live storefront", () => {
  const provider = configured ? shopifyProviderFromEnv() : undefined;

  it("satisfies the provider contract", () => {
    assertProviderShape(provider!);
  });

  it("lists products", async () => {
    const products = await provider!.getProducts();
    expect(Array.isArray(products)).toBe(true);
    for (const product of products) {
      expect(typeof product.handle).toBe("string");
      expect(product.externalUrl).toContain("/products/");
      expect(typeof product.priceRange.minVariantPrice.amount).toBe("string");
    }
  }, 30_000);

  it("lists collections, always starting with All", async () => {
    const collections = await provider!.getCollections();
    expect(collections[0]).toMatchObject({ handle: "", path: "/search" });
  }, 30_000);

  it("returns null for a handle that cannot exist", async () => {
    await expect(
      provider!.getProduct("corte-commerce-nonexistent-handle"),
    ).resolves.toBeNull();
  }, 30_000);
});
