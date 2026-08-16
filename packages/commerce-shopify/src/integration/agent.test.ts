/**
 * Live Admin API checks for the agent backend. Read-only — nothing here calls
 * `updateProduct`, so pointing these at a real store cannot change its
 * catalog. They exist to catch API-version drift and scope/shape breakage.
 *
 * Run with:
 *   COMMERCE_INTEGRATION=1 SHOPIFY_STORE_DOMAIN=... \
 *   SHOPIFY_ADMIN_ACCESS_TOKEN=... npx vitest run packages/commerce-shopify
 */
import { createCommerceAgentTools } from "@corte-so/commerce-agent-tools";
import { describe, expect, it } from "vitest";
import { createShopifyAgentBackend } from "../agent/backend.js";
import { shopifyAdminClientFromEnv } from "../agent/client.js";

const configured =
  Boolean(process.env.SHOPIFY_STORE_DOMAIN) &&
  Boolean(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN);

describe.skipIf(!configured)("shopify live admin agent backend", () => {
  const backend = configured
    ? createShopifyAgentBackend(shopifyAdminClientFromEnv())
    : undefined;

  it("generates the full tool suite", () => {
    expect(backend!.providerId).toBe("shopify");
    expect(createCommerceAgentTools(backend!).map((tool) => tool.verb)).toEqual([
      "list_products",
      "get_product",
      "list_collections",
      "update_product",
      "list_orders",
    ]);
  });

  it("lists products", async () => {
    const products = await backend!.listProducts({ limit: 5 });
    expect(Array.isArray(products)).toBe(true);
    for (const product of products) {
      expect(typeof product.handle).toBe("string");
      expect(product.externalUrl).toContain("/products/");
      expect(typeof product.priceRange.minVariantPrice.amount).toBe("string");
    }
  }, 30_000);

  it("fetches the first listed product by id and again by handle", async () => {
    const [summary] = await backend!.listProducts({ limit: 1 });
    if (!summary) return; // Empty catalog — nothing to assert against.

    const byId = await backend!.getProduct(summary.id);
    const byHandle = await backend!.getProduct(summary.handle);

    expect(byId?.id).toBe(summary.id);
    expect(byHandle?.id).toBe(summary.id);
    expect(Array.isArray(byId?.variants)).toBe(true);
  }, 30_000);

  it("returns null for a handle that cannot exist", async () => {
    await expect(
      backend!.getProduct("corte-commerce-nonexistent-handle"),
    ).resolves.toBeNull();
  }, 30_000);

  it("lists collections", async () => {
    const collections = await backend!.listCollections!();
    for (const collection of collections) {
      expect(collection.path).toBe(`/search/${collection.handle}`);
    }
  }, 30_000);

  it("lists orders", async () => {
    // Needs `read_orders`; a token without it fails here rather than silently
    // returning an empty list, which is the point of the check.
    const orders = await backend!.listOrders!({ limit: 5, status: "any" });
    for (const order of orders) {
      expect(typeof order.status).toBe("string");
      expect(typeof order.total.amount).toBe("string");
    }
  }, 30_000);
});
