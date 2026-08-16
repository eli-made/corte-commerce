import { describe, expect, it } from "vitest";
import { createCommerceAgentTools } from "@corte-so/commerce-agent-tools";
import { CommerceApiError, CommerceConfigError } from "@corte-so/commerce-core";
import type { SquarespaceProduct, SquarespaceProductsResponse } from "../types.js";
import { createSquarespaceAgentBackend } from "./backend.js";
import {
  createSquarespaceAgentClient,
  squarespaceAgentClientFromEnv,
} from "./client.js";
import type { SquarespaceOrder, SquarespaceOrdersResponse } from "./types.js";

const API_KEY = "sq-agent-key-do-not-leak";
const STORE_DOMAIN = "shop.example.com";

function makeProduct(
  overrides: Partial<SquarespaceProduct> & Pick<SquarespaceProduct, "id" | "name">,
): SquarespaceProduct {
  return {
    type: "PHYSICAL",
    description: "<p>A thing.</p>",
    url: `https://shop.example.com/store/p/${overrides.id}`,
    urlSlug: overrides.id,
    isVisible: true,
    tags: [],
    seoOptions: { title: overrides.name, description: "Seo description" },
    variantAttributes: [],
    variants: [],
    images: [],
    createdOn: "2026-01-01T00:00:00.000Z",
    modifiedOn: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function priced(value: string, currency = "USD") {
  return {
    id: `var-${value}`,
    sku: `SKU-${value}`,
    pricing: { basePrice: { currency, value }, onSale: false },
    stock: { quantity: 3, unlimited: false },
  };
}

const alpineTote = makeProduct({
  id: "prod-tote",
  name: "Alpine Tote",
  tags: ["bags", "summer"],
  createdOn: "2026-01-02T00:00:00.000Z",
  variantAttributes: ["Color"],
  variants: [
    { ...priced("120.00"), attributes: { Color: "Sand" } },
    { ...priced("140.00"), attributes: { Color: "Black" } },
  ],
  images: [
    {
      id: "img-tote",
      url: "https://images.example.com/tote.jpg",
      altText: "A tote",
      originalSize: { width: 800, height: 600 },
    },
  ],
});

const linenShirt = makeProduct({
  id: "prod-shirt",
  name: "Linen Camp Shirt",
  tags: ["shirts", "summer"],
  createdOn: "2026-03-05T00:00:00.000Z",
  variants: [priced("59.00")],
});

const internalSample = makeProduct({
  id: "prod-hidden",
  name: "Internal Sample",
  tags: ["corte-frontend-hidden", "samples"],
  variants: [priced("1.00")],
});

const woolScarf = makeProduct({
  id: "prod-scarf",
  name: "Wool Scarf",
  tags: ["accessories", "hidden-internal"],
  createdOn: "2026-02-01T00:00:00.000Z",
  variants: [priced("35.00")],
});

const CATALOG = [alpineTote, linenShirt, internalSample, woolScarf];

const PAGE_ONE: SquarespaceProductsResponse = {
  products: [alpineTote, linenShirt],
  pagination: { hasNextPage: true, nextPageCursor: "cursor-page-2" },
};

const PAGE_TWO: SquarespaceProductsResponse = {
  products: [internalSample, woolScarf],
  pagination: { hasNextPage: false, nextPageCursor: null },
};

const pendingOrder: SquarespaceOrder = {
  id: "order-1",
  orderNumber: "3",
  createdOn: "2026-04-01T10:00:00.000Z",
  modifiedOn: "2026-04-01T10:00:00.000Z",
  fulfillmentStatus: "PENDING",
  customerEmail: "bob@example.com",
  billingAddress: { firstName: "Bob", lastName: "Loblaw" },
  grandTotal: { currency: "USD", value: 49.99 },
  lineItems: [
    { productName: "Linen Camp Shirt", quantity: 2 },
    { productName: "Alpine Tote", quantity: 1 },
  ],
};

const fulfilledOrder: SquarespaceOrder = {
  id: "order-2",
  orderNumber: "4",
  createdOn: "2026-04-02T10:00:00.000Z",
  fulfillmentStatus: "FULFILLED",
  customerEmail: "ada@example.com",
  // Real stores send decimal strings here; the docs example shows a number.
  grandTotal: { currency: "GBP", value: "129.50" },
  lineItems: [
    { productName: "One", quantity: 1 },
    { productName: "Two", quantity: 1 },
    { productName: "Three", quantity: 1 },
    { productName: "Four", quantity: 1 },
    { productName: "Five", quantity: 2 },
  ],
};

const canceledOrder: SquarespaceOrder = {
  id: "order-3",
  fulfillmentStatus: "CANCELED",
  createdOn: "2026-04-03T10:00:00.000Z",
  grandTotal: { currency: "USD", value: "0.00" },
  lineItems: [],
};

type Reply = { status?: number; body?: unknown; text?: string };
type Call = {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: unknown;
};

function makeFetch(handler: (url: URL, call: Call) => Reply) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));
    const call: Call = {
      url,
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const { status = 200, body, text } = handler(url, call);
    return new Response(text ?? JSON.stringify(body ?? {}), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** Two-page catalog, product lookups by id, and an order feed. */
function storeFetch(orderPages: SquarespaceOrdersResponse[] = []) {
  return makeFetch((url) => {
    if (url.pathname === "/1.0/commerce/products") {
      return {
        body: url.searchParams.get("cursor") === "cursor-page-2" ? PAGE_TWO : PAGE_ONE,
      };
    }
    if (url.pathname === "/1.0/commerce/orders") {
      const cursor = url.searchParams.get("cursor");
      const index = cursor ? Number(cursor.replace("orders-page-", "")) - 1 : 0;
      return { body: orderPages[index] ?? { result: [], pagination: {} } };
    }
    if (url.pathname.startsWith("/v2/commerce/products/")) {
      return { body: { id: url.pathname.split("/").pop() } };
    }
    const id = url.pathname.split("/").pop();
    const found = CATALOG.find((product) => product.id === id);
    return found
      ? { body: { products: [found] } }
      : { status: 404, body: { message: "Not found" } };
  });
}

function makeBackend(fetchImpl: typeof fetch, storeDomain = STORE_DOMAIN) {
  return createSquarespaceAgentBackend(
    createSquarespaceAgentClient({ apiKey: API_KEY, storeDomain, fetch: fetchImpl }),
  );
}

describe("listProducts", () => {
  it("reuses the catalog mapping, including externalUrl", async () => {
    const products = await makeBackend(storeFetch().fetchImpl).listProducts({
      limit: 20,
    });

    expect(products[0]).toEqual({
      id: "prod-tote",
      handle: "prod-tote",
      title: "Alpine Tote",
      availableForSale: true,
      priceRange: {
        minVariantPrice: { amount: "120.00", currencyCode: "USD" },
        maxVariantPrice: { amount: "140.00", currencyCode: "USD" },
      },
      tags: ["bags", "summer"],
      updatedAt: "2026-01-01T00:00:00.000Z",
      featuredImageUrl: "https://images.example.com/tote.jpg",
      externalUrl: "https://shop.example.com/store/p/prod-tote",
    });
  });

  it("follows pagination cursors and shows the merchant the whole catalog", async () => {
    const { fetchImpl, calls } = storeFetch();
    const products = await makeBackend(fetchImpl).listProducts({ limit: 20 });

    expect(calls).toHaveLength(2);
    expect(calls[1]!.url.searchParams.get("cursor")).toBe("cursor-page-2");
    // Storefront-hidden products stay visible to the agent.
    expect(products.map((product) => product.id)).toEqual([
      "prod-tote",
      "prod-shirt",
      "prod-hidden",
      "prod-scarf",
    ]);
  });

  it("filters by query and sorts client-side, then applies the limit", async () => {
    const backend = makeBackend(storeFetch().fetchImpl);

    expect(
      (await backend.listProducts({ query: "SHIRT", limit: 20 })).map((p) => p.title),
    ).toEqual(["Linen Camp Shirt"]);

    expect(
      (await backend.listProducts({ sortKey: "price", limit: 2 })).map((p) => p.title),
    ).toEqual(["Internal Sample", "Wool Scarf"]);

    expect(
      (
        await backend.listProducts({ sortKey: "price", reverse: true, limit: 2 })
      ).map((p) => p.title),
    ).toEqual(["Alpine Tote", "Linen Camp Shirt"]);
  });

  it("authenticates with a bearer token", async () => {
    const { fetchImpl, calls } = storeFetch();
    await makeBackend(fetchImpl).listProducts({ limit: 5 });
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${API_KEY}`);
  });
});

describe("getProduct", () => {
  it("returns full detail for a product id", async () => {
    const product = await makeBackend(storeFetch().fetchImpl).getProduct("prod-tote");

    expect(product).toMatchObject({
      id: "prod-tote",
      handle: "prod-tote",
      title: "Alpine Tote",
      description: "A thing.",
      options: [{ name: "Color", values: ["Sand", "Black"] }],
      images: [{ url: "https://images.example.com/tote.jpg", altText: "A tote" }],
      seo: { title: "Alpine Tote", description: "Seo description" },
    });
    expect(product?.variants).toEqual([
      {
        id: "var-120.00",
        title: "Sand",
        price: { amount: "120.00", currencyCode: "USD" },
        availableForSale: true,
      },
      {
        id: "var-140.00",
        title: "Black",
        price: { amount: "140.00", currencyCode: "USD" },
        availableForSale: true,
      },
    ]);
  });

  it("returns null on 404", async () => {
    expect(await makeBackend(storeFetch().fetchImpl).getProduct("nope")).toBeNull();
  });

  it("returns null for an empty id without calling the API", async () => {
    const { fetchImpl, calls } = storeFetch();
    expect(await makeBackend(fetchImpl).getProduct("  ")).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("listCollections", () => {
  it("derives collections from the visible catalog's tags", async () => {
    const collections = await makeBackend(storeFetch().fetchImpl).listCollections!();

    expect(collections).toEqual([
      { handle: "bags", title: "bags", description: "bags", path: "/search/bags", productCount: 1 },
      {
        handle: "summer",
        title: "summer",
        description: "summer",
        path: "/search/summer",
        productCount: 2,
      },
      {
        handle: "shirts",
        title: "shirts",
        description: "shirts",
        path: "/search/shirts",
        productCount: 1,
      },
      {
        handle: "accessories",
        title: "accessories",
        description: "accessories",
        path: "/search/accessories",
        productCount: 1,
      },
    ]);
    // "samples" belongs only to a storefront-hidden product; "hidden-internal"
    // is a hidden tag. Neither is storefront navigation.
    expect(collections.map((c) => c.handle)).not.toContain("samples");
    expect(collections.map((c) => c.handle)).not.toContain("hidden-internal");
  });
});

describe("updateProduct", () => {
  it("posts documented change-wrapped fields to the v2 endpoint", async () => {
    const { fetchImpl, calls } = storeFetch();
    const updated = await makeBackend(fetchImpl).updateProduct!("prod-shirt", {
      title: "Linen Camp Shirt II",
      description: "Softer.",
      tags: ["shirts", "linen"],
      visible: false,
    });

    const post = calls.find((call) => call.method === "POST")!;
    expect(post.url.pathname).toBe("/v2/commerce/products/prod-shirt");
    expect(post.headers["Content-Type"]).toBe("application/json");
    expect(post.body).toEqual({
      name: { present: true, value: "Linen Camp Shirt II" },
      description: { present: true, value: "Softer." },
      tags: { present: true, value: ["shirts", "linen"] },
      isVisible: { present: true, value: false },
    });
    // Re-read on 1.0, so the result is shaped exactly like get_product.
    expect(updated.id).toBe("prod-shirt");
    expect(updated.variants).toHaveLength(1);
  });

  it("merges a partial seo change so the other field is not blanked", async () => {
    const { fetchImpl, calls } = storeFetch();
    await makeBackend(fetchImpl).updateProduct!("prod-shirt", {
      seo: { title: "Camp shirts for summer" },
    });

    expect(calls.find((call) => call.method === "POST")!.body).toEqual({
      seoData: {
        present: true,
        value: {
          title: "Camp shirts for summer",
          description: "Seo description",
        },
      },
    });
  });

  it("skips the write when there is nothing to change", async () => {
    const { fetchImpl, calls } = storeFetch();
    const product = await makeBackend(fetchImpl).updateProduct!("prod-shirt", {});

    expect(calls.some((call) => call.method === "POST")).toBe(false);
    expect(product.title).toBe("Linen Camp Shirt");
  });

  it("reports an unknown product as a 404 without writing", async () => {
    const { fetchImpl, calls } = storeFetch();
    const error = await makeBackend(fetchImpl)
      .updateProduct!("nope", { title: "x" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CommerceApiError);
    expect((error as CommerceApiError).status).toBe(404);
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("wraps a rejected write without leaking the API key", async () => {
    const { fetchImpl } = makeFetch((url) => {
      if (url.pathname.startsWith("/v2/")) {
        return { status: 403, body: { message: "Insufficient permissions" } };
      }
      return { body: { products: [linenShirt] } };
    });

    const error = await makeBackend(fetchImpl)
      .updateProduct!("prod-shirt", { title: "x" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CommerceApiError);
    const apiError = error as CommerceApiError;
    expect(apiError.provider).toBe("squarespace");
    expect(apiError.status).toBe(403);
    expect(apiError.message).toContain("Insufficient permissions");
    expect(apiError.message).not.toContain(API_KEY);
  });
});

describe("listOrders", () => {
  const onePage: SquarespaceOrdersResponse[] = [
    {
      result: [pendingOrder, fulfilledOrder, canceledOrder],
      pagination: { hasNextPage: false },
    },
  ];

  it("maps orders onto the agent summary shape", async () => {
    const orders = await makeBackend(storeFetch(onePage).fetchImpl).listOrders!({
      limit: 20,
      status: "any",
    });

    expect(orders[0]).toEqual({
      id: "order-1",
      number: "3",
      status: "open",
      createdAt: "2026-04-01T10:00:00.000Z",
      total: { amount: "49.99", currencyCode: "USD" },
      customer: { name: "Bob Loblaw", email: "bob@example.com" },
      lineCount: 2,
      lineSummary: "2× Linen Camp Shirt, 1× Alpine Tote",
    });
  });

  it("reads money from its own currency and status from fulfillment", async () => {
    const orders = await makeBackend(storeFetch(onePage).fetchImpl).listOrders!({
      limit: 20,
      status: "any",
    });

    expect(orders.map((order) => order.status)).toEqual([
      "open",
      "completed",
      "canceled",
    ]);
    expect(orders[1]!.total).toEqual({ amount: "129.50", currencyCode: "GBP" });
    expect(orders[1]!.customer).toEqual({ email: "ada@example.com" });
    expect(orders[2]!.lineCount).toBe(0);
    expect(orders[2]!.lineSummary).toBeUndefined();
    expect(orders[2]!.number).toBeUndefined();
  });

  it("truncates a long line summary", async () => {
    const orders = await makeBackend(storeFetch(onePage).fetchImpl).listOrders!({
      limit: 20,
      status: "any",
    });
    expect(orders[1]!.lineSummary).toBe("1× One, 1× Two, 1× Three +2 more");
  });

  it("walks cursor pages until the limit is met", async () => {
    const pages: SquarespaceOrdersResponse[] = [
      {
        result: [pendingOrder],
        pagination: { hasNextPage: true, nextPageCursor: "orders-page-2" },
      },
      { result: [fulfilledOrder], pagination: { hasNextPage: false } },
    ];

    const { fetchImpl, calls } = storeFetch(pages);
    const orders = await makeBackend(fetchImpl).listOrders!({
      limit: 20,
      status: "any",
    });

    const orderCalls = calls.filter(
      (call) => call.url.pathname === "/1.0/commerce/orders",
    );
    expect(orderCalls).toHaveLength(2);
    expect(orderCalls[1]!.url.searchParams.get("cursor")).toBe("orders-page-2");
    expect(orders.map((order) => order.id)).toEqual(["order-1", "order-2"]);
  });

  it("filters server-side, and pages with the cursor alone", async () => {
    const pages: SquarespaceOrdersResponse[] = [
      {
        result: [fulfilledOrder],
        pagination: { hasNextPage: true, nextPageCursor: "orders-page-2" },
      },
      { result: [fulfilledOrder], pagination: { hasNextPage: false } },
    ];

    const { fetchImpl, calls } = storeFetch(pages);
    await makeBackend(fetchImpl).listOrders!({ limit: 20, status: "completed" });

    const orderCalls = calls.filter(
      (call) => call.url.pathname === "/1.0/commerce/orders",
    );
    expect(orderCalls[0]!.url.searchParams.get("fulfillmentStatus")).toBe("FULFILLED");
    // The API documents cursor as exclusive of the other parameters.
    expect(orderCalls[1]!.url.searchParams.get("fulfillmentStatus")).toBeNull();
    expect(orderCalls[1]!.url.searchParams.get("cursor")).toBe("orders-page-2");
  });

  it("sends no status filter for `any`, and honors the limit", async () => {
    const { fetchImpl, calls } = storeFetch(onePage);
    const orders = await makeBackend(fetchImpl).listOrders!({
      limit: 2,
      status: "any",
    });

    expect(calls[0]!.url.search).toBe("");
    expect(orders).toHaveLength(2);
  });

  it("maps each suite status onto its documented fulfillment state", async () => {
    for (const [status, expected] of [
      ["open", "PENDING"],
      ["completed", "FULFILLED"],
      ["canceled", "CANCELED"],
    ] as const) {
      const { fetchImpl, calls } = storeFetch(onePage);
      await makeBackend(fetchImpl).listOrders!({ limit: 5, status });
      expect(calls[0]!.url.searchParams.get("fulfillmentStatus")).toBe(expected);
    }
  });
});

describe("squarespaceAgentClientFromEnv", () => {
  it("names the missing variable instead of sending an unauthenticated request", () => {
    expect(() => squarespaceAgentClientFromEnv({})).toThrow(CommerceConfigError);
    expect(() => squarespaceAgentClientFromEnv({})).toThrow(
      /Missing required configuration: SQUARESPACE_API_TOKEN/,
    );
    expect(() => squarespaceAgentClientFromEnv({ SQUARESPACE_API_TOKEN: "" })).toThrow(
      CommerceConfigError,
    );
  });

  it("builds a client from the documented variables", () => {
    const client = squarespaceAgentClientFromEnv({
      SQUARESPACE_API_TOKEN: API_KEY,
      SQUARESPACE_STORE_DOMAIN: STORE_DOMAIN,
    });
    expect(client.storeOrigin).toBe("https://shop.example.com");
    expect(typeof client.get).toBe("function");
    expect(typeof client.post).toBe("function");
  });
});

describe("generated tool suite", () => {
  const backend = makeBackend(storeFetch().fetchImpl);

  it("generates every tool the documented APIs can back", () => {
    expect(createCommerceAgentTools(backend).map((tool) => tool.verb)).toEqual([
      "list_products",
      "get_product",
      "list_collections",
      "update_product",
      "list_orders",
    ]);
  });

  it("marks update_product as the only write", () => {
    const writes = createCommerceAgentTools(backend)
      .filter((tool) => tool.access === "write")
      .map((tool) => tool.verb);
    expect(writes).toEqual(["update_product"]);
    expect(backend.providerId).toBe("squarespace");
  });

  it("executes through the suite", async () => {
    const tools = createCommerceAgentTools(backend);
    const listProducts = tools.find((tool) => tool.verb === "list_products")!;
    const result = (await listProducts.execute({ limit: 1 })) as { id: string }[];
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("prod-tote");
  });
});
