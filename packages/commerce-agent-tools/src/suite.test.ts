import { describe, expect, it, vi } from "vitest";
import type {
  AgentProductDetail,
  CommerceAgentBackend,
} from "./backend.js";
import { createCommerceAgentTools } from "./suite.js";

const detail: AgentProductDetail = {
  id: "p1",
  handle: "shirt",
  title: "Shirt",
  availableForSale: true,
  priceRange: {
    minVariantPrice: { amount: "10.00", currencyCode: "USD" },
    maxVariantPrice: { amount: "12.00", currencyCode: "USD" },
  },
  tags: [],
  updatedAt: "2026-01-01T00:00:00Z",
  description: "A shirt.",
  options: [],
  variants: [],
  images: [],
  seo: { title: "Shirt", description: "" },
};

function minimalBackend(
  extra: Partial<CommerceAgentBackend> = {},
): CommerceAgentBackend {
  return {
    providerId: "test",
    listProducts: vi.fn(async () => [detail]),
    getProduct: vi.fn(async () => detail),
    ...extra,
  };
}

describe("createCommerceAgentTools", () => {
  it("generates only the tools the backend implements", () => {
    const verbs = (b: CommerceAgentBackend) =>
      createCommerceAgentTools(b).map((t) => t.verb);

    expect(verbs(minimalBackend())).toEqual(["list_products", "get_product"]);
    expect(
      verbs(
        minimalBackend({
          listCollections: async () => [],
          updateProduct: async () => detail,
          listOrders: async () => [],
        }),
      ),
    ).toEqual([
      "list_products",
      "get_product",
      "list_collections",
      "update_product",
      "list_orders",
    ]);
  });

  it("marks exactly update_product as write", () => {
    const tools = createCommerceAgentTools(
      minimalBackend({ updateProduct: async () => detail, listOrders: async () => [] }),
    );
    const writes = tools.filter((t) => t.access === "write").map((t) => t.verb);
    expect(writes).toEqual(["update_product"]);
  });

  it("applies schema defaults before calling the backend", async () => {
    const backend = minimalBackend({ listOrders: vi.fn(async () => []) });
    const tools = createCommerceAgentTools(backend);
    await tools.find((t) => t.verb === "list_products")!.execute({});
    expect(backend.listProducts).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 }),
    );
    await tools.find((t) => t.verb === "list_orders")!.execute(undefined);
    expect(backend.listOrders).toHaveBeenCalledWith({ limit: 20, status: "any" });
  });

  it("rejects invalid input with the verb and field named", async () => {
    const tools = createCommerceAgentTools(minimalBackend());
    await expect(
      tools.find((t) => t.verb === "list_products")!.execute({ limit: 0 }),
    ).rejects.toThrow(/list_products[\s\S]*limit/);
  });

  it("splits update_product input into id + changes", async () => {
    const updateProduct = vi.fn(async () => detail);
    const tools = createCommerceAgentTools(minimalBackend({ updateProduct }));
    await tools
      .find((t) => t.verb === "update_product")!
      .execute({ id: "p1", title: "New", visible: false });
    expect(updateProduct).toHaveBeenCalledWith("p1", {
      title: "New",
      visible: false,
    });
  });

  it("publishes JSON Schema that matches the snapshot (agent-facing API)", () => {
    const tools = createCommerceAgentTools(
      minimalBackend({
        listCollections: async () => [],
        updateProduct: async () => detail,
        listOrders: async () => [],
      }),
    );
    const schemas = Object.fromEntries(
      tools.map((t) => [t.verb, t.inputSchema]),
    );
    expect(schemas).toMatchSnapshot();
  });
});
