// Read-only sanity checks against a real Squarespace store. Skipped unless
// SQUARESPACE_API_TOKEN is set, and only collected at all when the runner is
// started with COMMERCE_INTEGRATION=1 (see vitest.config.ts).
import { describe, expect, it } from "vitest";
import { assertProviderShape } from "@corte-so/commerce-core";
import { squarespaceProviderFromEnv } from "../provider.js";

const token = process.env.SQUARESPACE_API_TOKEN;

// Built inside the tests, not at suite scope: a skipped suite is still
// collected, and constructing it early would throw on the missing token.
const provider = () => squarespaceProviderFromEnv(process.env);

describe.skipIf(!token)("squarespace live catalog", () => {
  it("satisfies the contract", () => {
    expect(() => assertProviderShape(provider())).not.toThrow();
  });

  it("lists products with usable money and handles", async () => {
    const products = await provider().getProducts();
    expect(Array.isArray(products)).toBe(true);

    const product = products[0];
    if (!product) return; // an empty store is a valid state, not a failure

    expect(product.handle).toBeTruthy();
    expect(product.title).toBeTruthy();
    expect(product.priceRange.minVariantPrice.currencyCode).toMatch(/^[A-Z]{3}$/);
    expect(Number.isFinite(Number(product.priceRange.minVariantPrice.amount))).toBe(
      true,
    );

    const fetched = await provider().getProduct(product.handle);
    expect(fetched?.id).toBe(product.id);
  }, 30_000);

  it("derives collections from tags", async () => {
    const collections = await provider().getCollections();
    for (const collection of collections) {
      expect(collection.path.startsWith("/search/")).toBe(true);
      expect(collection.handle.toLowerCase().startsWith("hidden")).toBe(false);
    }

    const first = collections[0];
    if (!first) return;
    const products = await provider().getCollectionProducts({
      collection: first.handle,
    });
    expect(products.every((product) => product.tags.includes(first.handle))).toBe(
      true,
    );
  }, 30_000);

  it("returns null for an unknown product id", async () => {
    expect(await provider().getProduct("definitely-not-a-product-id")).toBeNull();
  }, 30_000);
});
