/**
 * Live Storefront GraphQL checks. Read-only and deliberately light — they
 * exist to catch schema drift and credential/shape breakage, not to assert on
 * any particular store's catalog. Nothing here creates or mutates a cart.
 *
 * Run with:
 *   COMMERCE_INTEGRATION=1 BIGCOMMERCE_STORE_HASH=... \
 *   BIGCOMMERCE_CUSTOMER_IMPERSONATION_TOKEN=... \
 *   npx vitest run packages/commerce-bigcommerce
 */
import { assertProviderShape } from "@corte-so/commerce-core";
import { describe, expect, it } from "vitest";
import { bigCommerceProviderFromEnv } from "../provider.js";

const configured =
  Boolean(process.env.BIGCOMMERCE_STORE_HASH) &&
  Boolean(process.env.BIGCOMMERCE_CUSTOMER_IMPERSONATION_TOKEN);

describe.skipIf(!configured)("bigcommerce live storefront", () => {
  const provider = configured ? bigCommerceProviderFromEnv() : undefined;

  it("satisfies the provider contract", () => {
    assertProviderShape(provider!);
  });

  it("lists products with decimal-string money", async () => {
    const products = await provider!.getProducts();

    expect(Array.isArray(products)).toBe(true);
    for (const product of products) {
      expect(product.handle).not.toBe("");
      expect(product.priceRange.minVariantPrice.amount).toMatch(/^\d+\.\d{2}$/);
      expect(product.variants.length).toBeGreaterThan(0);
      // Every merchandise id this provider hands out is addressable by the
      // cart mutations: "productEntityId" or "productEntityId:variantEntityId".
      for (const variant of product.variants) {
        expect(variant.id).toMatch(/^\d+(:\d+)?$/);
      }
    }
  }, 30_000);

  it("round-trips the first product's handle", async () => {
    const [first] = await provider!.getProducts();
    if (!first) return;

    const fetched = await provider!.getProduct(first.handle);

    expect(fetched?.id).toBe(first.id);
  }, 30_000);

  it("lists collections and their products", async () => {
    const collections = await provider!.getCollections();

    expect(Array.isArray(collections)).toBe(true);

    const [first] = collections;
    if (!first) return;

    expect(first.path).toBe(`/search/${first.handle}`);
    await expect(
      provider!.getCollectionProducts({ collection: first.handle }),
    ).resolves.toBeInstanceOf(Array);
  }, 30_000);

  it("serves the header menu from the category tree", async () => {
    const menu = await provider!.getMenu!("header");

    expect(Array.isArray(menu)).toBe(true);
    for (const item of menu) {
      expect(item.path.startsWith("/search/")).toBe(true);
    }
  }, 30_000);

  it("lists pages", async () => {
    await expect(provider!.getPages!()).resolves.toBeInstanceOf(Array);
  }, 30_000);

  it("returns null for identifiers that cannot exist", async () => {
    await expect(
      provider!.getProduct("corte-commerce-nonexistent-handle"),
    ).resolves.toBeNull();
    await expect(
      provider!.cart!.getCart("00000000-0000-0000-0000-000000000000"),
    ).resolves.toBeNull();
  }, 30_000);
});
