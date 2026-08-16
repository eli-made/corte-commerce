/**
 * Live store management API checks for the agent backend. Read-only: nothing
 * here writes to the catalog, so `update_product` is exercised only as far as
 * the tool suite generating it. They exist to catch credential and payload-shape
 * breakage, not to assert on any particular store's catalog.
 *
 * Run with:
 *   COMMERCE_INTEGRATION=1 BIGCOMMERCE_STORE_HASH=... \
 *   BIGCOMMERCE_ACCESS_TOKEN=... \
 *   npx vitest run packages/commerce-bigcommerce
 */
import { createCommerceAgentTools } from "@corte-so/commerce-agent-tools";
import { describe, expect, it } from "vitest";

import {
  bigCommerceAdminClientFromEnv,
  createBigCommerceAgentBackend,
} from "../agent/index.js";

const configured =
  Boolean(process.env.BIGCOMMERCE_STORE_HASH) &&
  Boolean(process.env.BIGCOMMERCE_ACCESS_TOKEN);

describe.skipIf(!configured)("bigcommerce live agent backend", () => {
  const backend = configured
    ? createBigCommerceAgentBackend(bigCommerceAdminClientFromEnv())
    : undefined;

  it("generates the full tool suite", () => {
    expect(createCommerceAgentTools(backend!).map((tool) => tool.verb)).toEqual([
      "list_products",
      "get_product",
      "list_collections",
      "update_product",
      "list_orders",
    ]);
  });

  it("lists products with decimal-string money", async () => {
    const products = await backend!.listProducts({ limit: 5 });

    expect(Array.isArray(products)).toBe(true);
    for (const product of products) {
      expect(product.id).toMatch(/^\d+$/);
      expect(product.handle).not.toBe("");
      expect(product.priceRange.minVariantPrice.amount).toMatch(/^\d+\.\d{2}$/);
    }
  }, 30_000);

  it("reads a listed product back by id and by handle", async () => {
    const [summary] = await backend!.listProducts({ limit: 1 });
    if (!summary) return;

    const byId = await backend!.getProduct(summary.id);
    expect(byId?.id).toBe(summary.id);
    expect(byId!.variants.length).toBeGreaterThan(0);
    // Every merchandise id the backend hands out is cart-addressable:
    // "productEntityId" or "productEntityId:variantEntityId".
    for (const variant of byId!.variants) {
      expect(variant.id).toMatch(/^\d+(:\d+)?$/);
    }

    const byHandle = await backend!.getProduct(summary.handle);
    expect(byHandle?.id).toBe(summary.id);
  }, 30_000);

  it("returns null for an unknown product", async () => {
    await expect(backend!.getProduct("999999999")).resolves.toBeNull();
    await expect(
      backend!.getProduct("no-such-product-handle-xyz"),
    ).resolves.toBeNull();
  }, 30_000);

  it("lists collections", async () => {
    for (const collection of await backend!.listCollections!()) {
      expect(collection.handle).not.toBe("");
      expect(collection.path.startsWith("/")).toBe(true);
    }
  }, 30_000);

  it("lists orders within the requested limit", async () => {
    const orders = await backend!.listOrders!({ limit: 3, status: "any" });

    expect(orders.length).toBeLessThanOrEqual(3);
    for (const order of orders) {
      expect(order.total.amount).toMatch(/^\d+\.\d{2}$/);
      expect(order.total.currencyCode).not.toBe("");
    }
  }, 30_000);
});
