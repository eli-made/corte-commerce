// Read-only sanity checks of the agent backend against a real Squarespace
// store. Skipped unless SQUARESPACE_API_TOKEN is set, and only collected at
// all when the runner is started with COMMERCE_INTEGRATION=1 (see
// vitest.config.ts).
//
// `updateProduct` is deliberately not exercised here: it writes to a live
// catalog, and an integration suite should never edit a merchant's products.
import { describe, expect, it } from "vitest";
import { createCommerceAgentTools } from "@corte-so/commerce-agent-tools";
import { createSquarespaceAgentBackend } from "../agent/backend.js";
import { squarespaceAgentClientFromEnv } from "../agent/client.js";

const token = process.env.SQUARESPACE_API_TOKEN;

// Built inside the tests, not at suite scope: a skipped suite is still
// collected, and constructing it early would throw on the missing token.
const backend = () =>
  createSquarespaceAgentBackend(squarespaceAgentClientFromEnv(process.env));

describe.skipIf(!token)("squarespace live agent backend", () => {
  it("generates the documented tool suite", () => {
    expect(createCommerceAgentTools(backend()).map((tool) => tool.verb)).toEqual([
      "list_products",
      "get_product",
      "list_collections",
      "update_product",
      "list_orders",
    ]);
  });

  it("lists products with usable money and ids", async () => {
    const products = await backend().listProducts({ limit: 5 });
    expect(products.length).toBeLessThanOrEqual(5);

    const product = products[0];
    if (!product) return; // an empty store is a valid state, not a failure

    expect(product.id).toBeTruthy();
    expect(product.handle).toBe(product.id);
    expect(product.priceRange.minVariantPrice.currencyCode).toMatch(/^[A-Z]{3}$/);

    const detail = await backend().getProduct(product.id);
    expect(detail?.id).toBe(product.id);
    expect(Array.isArray(detail?.variants)).toBe(true);
  }, 30_000);

  it("derives collections from tags", async () => {
    for (const collection of await backend().listCollections!()) {
      expect(collection.path.startsWith("/search/")).toBe(true);
      expect(collection.productCount ?? 1).toBeGreaterThan(0);
    }
  }, 30_000);

  it("returns null for an unknown product id", async () => {
    expect(await backend().getProduct("definitely-not-a-product-id")).toBeNull();
  }, 30_000);

  it("lists orders, filtered and unfiltered", async () => {
    // Needs the Orders (read) permission on the key; a key without it fails
    // loudly here rather than silently returning nothing.
    const orders = await backend().listOrders!({ limit: 5, status: "any" });
    expect(orders.length).toBeLessThanOrEqual(5);

    for (const order of orders) {
      expect(order.id).toBeTruthy();
      expect(order.total.currencyCode).toMatch(/^[A-Z]{3}$/);
      expect(Number.isFinite(Number(order.total.amount))).toBe(true);
      expect(order.lineCount).toBeGreaterThanOrEqual(0);
    }

    const open = await backend().listOrders!({ limit: 5, status: "open" });
    expect(open.every((order) => order.status === "open")).toBe(true);
  }, 30_000);
});
