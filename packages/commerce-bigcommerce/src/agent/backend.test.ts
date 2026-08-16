import {
  CommerceApiError,
  CommerceConfigError,
  CommerceError,
} from "@corte-so/commerce-core";
import { createCommerceAgentTools } from "@corte-so/commerce-agent-tools";
import { describe, expect, it } from "vitest";

import {
  bigCommerceAdminClientFromEnv,
  createBigCommerceAdminClient,
  type BigCommerceAdminConfig,
} from "./client.js";
import { createBigCommerceAgentBackend, toCatalogSort } from "./backend.js";
import type {
  BigCommerceRestCategory,
  BigCommerceRestOrder,
  BigCommerceRestProduct,
} from "./types.js";

const TOKEN = "admin-token-do-not-log";

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const harness = (
  handler: Handler,
  config: Partial<BigCommerceAdminConfig> = {},
) => {
  const calls: { url: URL; init: RequestInit }[] = [];

  const client = createBigCommerceAdminClient({
    storeHash: "abc123",
    accessToken: TOKEN,
    currencyCode: "USD",
    storefrontUrl: "https://store.example.com",
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({ url, init: init ?? {} });
      return handler(url, init ?? {});
    }) as typeof fetch,
    ...config,
  });

  return { client, calls, backend: createBigCommerceAgentBackend(client) };
};

const product = (
  overrides: Partial<BigCommerceRestProduct> = {},
): BigCommerceRestProduct => ({
  id: 111,
  name: "Blue Shirt",
  description: "<p>A <strong>blue</strong> shirt &amp; more.</p>",
  sku: "SHIRT-BLUE",
  price: 25,
  calculated_price: 22.5,
  is_visible: true,
  availability: "available",
  inventory_tracking: "variant",
  inventory_level: 0,
  date_created: "2026-01-05T00:00:00+00:00",
  date_modified: "2026-02-01T09:30:00+00:00",
  page_title: "Blue Shirt | Acme",
  meta_description: "The blue shirt.",
  meta_keywords: ["seo-only"],
  search_keywords: "shirt, blue, summer",
  custom_url: { url: "/blue-shirt/", is_customized: false },
  images: [
    {
      id: 1,
      is_thumbnail: true,
      sort_order: 0,
      description: "Blue shirt, front",
      url_standard: "https://cdn.example.com/blue-standard.jpg",
      url_zoom: "https://cdn.example.com/blue-zoom.jpg",
    },
    {
      id: 2,
      is_thumbnail: false,
      sort_order: 1,
      description: "",
      url_standard: "https://cdn.example.com/blue-back.jpg",
    },
  ],
  variants: [
    {
      id: 222,
      product_id: 111,
      sku: "SHIRT-BLUE-S",
      price: null,
      calculated_price: 22.5,
      inventory_level: 4,
      purchasing_disabled: false,
      option_values: [{ id: 1, label: "Small", option_display_name: "Size" }],
    },
    {
      id: 223,
      product_id: 111,
      sku: "SHIRT-BLUE-L",
      price: 27.5,
      calculated_price: 27.5,
      inventory_level: 0,
      purchasing_disabled: false,
      option_values: [{ id: 2, label: "Large", option_display_name: "Size" }],
    },
  ],
  options: [
    {
      id: 5,
      display_name: "Size",
      option_values: [
        { id: 1, label: "Small" },
        { id: 2, label: "Large" },
      ],
    },
  ],
  ...overrides,
});

const category = (
  overrides: Partial<BigCommerceRestCategory> = {},
): BigCommerceRestCategory => ({
  id: 21,
  parent_id: 0,
  name: "Shirts",
  description: "<p>Every shirt.</p>",
  is_visible: true,
  custom_url: { url: "/shirts/" },
  ...overrides,
});

const order = (
  overrides: Partial<BigCommerceRestOrder> = {},
): BigCommerceRestOrder => ({
  id: 1001,
  status_id: 11,
  status: "Awaiting Fulfillment",
  date_created: "Tue, 20 Jan 2026 12:00:00 +0000",
  total_inc_tax: "45.0000",
  currency_code: "USD",
  items_total: 3,
  billing_address: {
    first_name: "Ada",
    last_name: "Lovelace",
    email: "ada@example.com",
  },
  ...overrides,
});

describe("bigcommerce admin client", () => {
  it("requests the store's management host with the auth-token header", async () => {
    const { client, calls } = harness(() => json({ data: [] }));

    await client.request("/v3/catalog/products", {
      query: { limit: 5, keyword: undefined },
    });

    expect(calls[0]!.url.origin).toBe("https://api.bigcommerce.com");
    expect(calls[0]!.url.pathname).toBe("/stores/abc123/v3/catalog/products");
    expect(calls[0]!.url.searchParams.get("limit")).toBe("5");
    // Undefined query values are dropped rather than serialised.
    expect(calls[0]!.url.searchParams.has("keyword")).toBe(false);
    expect(
      (calls[0]!.init.headers as Record<string, string>)["X-Auth-Token"],
    ).toBe(TOKEN);
  });

  it("never echoes the access token in an error", async () => {
    const { client } = harness(() =>
      new Response(`{"error":"bad token ${TOKEN}"}`, { status: 403 }),
    );

    const error = await client
      .request("/v3/catalog/products")
      .catch((caught: unknown) => caught as CommerceApiError);

    expect(error).toBeInstanceOf(CommerceApiError);
    expect(error.status).toBe(403);
    expect(error.provider).toBe("bigcommerce");
    expect(error.message).not.toContain(TOKEN);
    expect(error.message).toContain("[redacted]");
  });

  it("reports a transport failure as status 0", async () => {
    const { client } = harness(() => {
      throw new Error("socket hang up");
    });

    await expect(client.request("/v2/orders")).rejects.toMatchObject({
      status: 0,
    });
  });

  it("resolves null for a 404 and for v2's empty-body 'no results'", async () => {
    const missing = harness(() => new Response("", { status: 404 }));
    const empty = harness(() => new Response(null, { status: 204 }));

    await expect(missing.client.requestOrNull("/v3/catalog/products/9")).resolves.toBeNull();
    await expect(empty.client.requestOrNull("/v2/orders")).resolves.toBeNull();
  });
});

describe("bigCommerceAdminClientFromEnv", () => {
  it("names the missing variable", () => {
    expect(() => bigCommerceAdminClientFromEnv({})).toThrow(CommerceConfigError);
    expect(() => bigCommerceAdminClientFromEnv({})).toThrow(
      /BIGCOMMERCE_STORE_HASH/,
    );
    expect(() =>
      bigCommerceAdminClientFromEnv({ BIGCOMMERCE_STORE_HASH: "abc123" }),
    ).toThrow(/BIGCOMMERCE_ACCESS_TOKEN/);
  });

  it("reads the optional storefront and currency settings", () => {
    const client = bigCommerceAdminClientFromEnv({
      BIGCOMMERCE_STORE_HASH: "abc123",
      BIGCOMMERCE_ACCESS_TOKEN: TOKEN,
      BIGCOMMERCE_STOREFRONT_URL: "https://store.example.com",
      BIGCOMMERCE_CURRENCY_CODE: "GBP",
    });

    expect(client.storeHash).toBe("abc123");
    expect(client.storefrontUrl).toBe("https://store.example.com");
    expect(client.currencyCode).toBe("GBP");
  });

  it("leaves catalog prices uncurrencied when nothing says otherwise", () => {
    const client = bigCommerceAdminClientFromEnv({
      BIGCOMMERCE_STORE_HASH: "abc123",
      BIGCOMMERCE_ACCESS_TOKEN: TOKEN,
    });

    expect(client.currencyCode).toBe("");
    expect(client.storefrontUrl).toBeUndefined();
  });
});

describe("listProducts", () => {
  it("maps a v3 product onto the agent summary shape", async () => {
    const { backend, calls } = harness(() => json({ data: [product()] }));

    const [summary] = await backend.listProducts({ limit: 20 });

    expect(summary).toEqual({
      id: "111",
      handle: "blue-shirt",
      title: "Blue Shirt",
      availableForSale: true,
      priceRange: {
        minVariantPrice: { amount: "22.50", currencyCode: "USD" },
        maxVariantPrice: { amount: "27.50", currencyCode: "USD" },
      },
      tags: ["shirt", "blue", "summer"],
      updatedAt: "2026-02-01T09:30:00+00:00",
      featuredImageUrl: "https://cdn.example.com/blue-standard.jpg",
      externalUrl: "https://store.example.com/blue-shirt",
    });
    expect(calls[0]!.url.searchParams.get("include")).toBe("variants,images");
    expect(calls[0]!.url.searchParams.get("limit")).toBe("20");
  });

  it("omits externalUrl when no storefront origin is configured", async () => {
    const { backend } = harness(() => json({ data: [product()] }), {
      storefrontUrl: undefined,
    });

    const [summary] = await backend.listProducts({ limit: 5 });

    expect(summary!.externalUrl).toBeUndefined();
  });

  it("reports hidden and disabled products as unavailable", async () => {
    const { backend } = harness(() =>
      json({
        data: [
          product({ id: 1, is_visible: false }),
          product({ id: 2, availability: "disabled" }),
          product({
            id: 3,
            inventory_tracking: "product",
            inventory_level: 0,
            variants: [],
          }),
          product({ id: 4, inventory_tracking: "none", variants: [] }),
        ],
      }),
    );

    expect(
      (await backend.listProducts({ limit: 10 })).map((p) => p.availableForSale),
    ).toEqual([false, false, false, true]);
  });

  it("passes the free-text query through as a v3 keyword", async () => {
    const { backend, calls } = harness(() => json({ data: [] }));

    await backend.listProducts({ limit: 10, query: "linen shirt" });

    expect(calls[0]!.url.searchParams.get("keyword")).toBe("linen shirt");
  });

  it.each([
    ["created-at", false, "date_created", "asc"],
    ["created-at", true, "date_created", "desc"],
    ["price", false, "price", "asc"],
    ["price", true, "price", "desc"],
    ["best-selling", false, "total_sold", "desc"],
    ["best-selling", true, "total_sold", "asc"],
  ] as const)(
    "maps sortKey %s (reverse: %s) onto sort=%s direction=%s",
    async (sortKey, reverse, sort, direction) => {
      const { backend, calls } = harness(() => json({ data: [] }));

      await backend.listProducts({ limit: 10, sortKey, reverse });

      expect(calls[0]!.url.searchParams.get("sort")).toBe(sort);
      expect(calls[0]!.url.searchParams.get("direction")).toBe(direction);
    },
  );

  it("sends no sort for relevance, which v3 has no equivalent for", async () => {
    const { backend, calls } = harness(() => json({ data: [] }));

    await backend.listProducts({ limit: 10, sortKey: "relevance" });
    await backend.listProducts({ limit: 10 });

    expect(toCatalogSort("relevance")).toBeNull();
    for (const call of calls) {
      expect(call.url.searchParams.has("sort")).toBe(false);
      expect(call.url.searchParams.has("direction")).toBe(false);
    }
  });
});

describe("getProduct", () => {
  it("fetches a numeric id with every sub-resource the detail needs", async () => {
    const { backend, calls } = harness(() => json({ data: product() }));

    const detail = await backend.getProduct("111");

    expect(calls[0]!.url.pathname).toBe("/stores/abc123/v3/catalog/products/111");
    expect(calls[0]!.url.searchParams.get("include")).toBe(
      "variants,images,options",
    );
    expect(detail).toMatchObject({
      id: "111",
      handle: "blue-shirt",
      description: "A blue shirt & more.",
      options: [{ name: "Size", values: ["Small", "Large"] }],
      seo: { title: "Blue Shirt | Acme", description: "The blue shirt." },
      images: [
        {
          url: "https://cdn.example.com/blue-standard.jpg",
          altText: "Blue shirt, front",
        },
        // An image with no description borrows the product's name.
        { url: "https://cdn.example.com/blue-back.jpg", altText: "Blue Shirt" },
      ],
    });
    expect(detail!.variants).toEqual([
      {
        id: "111:222",
        title: "Small",
        price: { amount: "22.50", currencyCode: "USD" },
        availableForSale: true,
      },
      {
        id: "111:223",
        title: "Large",
        price: { amount: "27.50", currencyCode: "USD" },
        // Variant-level inventory tracking, zero on hand.
        availableForSale: false,
      },
    ]);
  });

  it("synthesises a default variant for a product with no variant rows", async () => {
    const { backend } = harness(() =>
      json({ data: product({ variants: [], inventory_tracking: "none" }) }),
    );

    const detail = await backend.getProduct("111");

    expect(detail!.variants).toEqual([
      {
        id: "111",
        title: "Default Title",
        price: { amount: "22.50", currencyCode: "USD" },
        availableForSale: true,
      },
    ]);
  });

  it("returns null for a 404", async () => {
    const { backend } = harness(() => json({ status: 404 }, 404));

    await expect(backend.getProduct("999")).resolves.toBeNull();
  });

  it("resolves a handle through a keyword search, matching the slug exactly", async () => {
    const { backend, calls } = harness(() =>
      json({
        data: [
          product({ id: 900, custom_url: { url: "/blue-shirt-vintage/" } }),
          product(),
        ],
      }),
    );

    const detail = await backend.getProduct("blue-shirt");

    expect(calls[0]!.url.pathname).toBe("/stores/abc123/v3/catalog/products");
    // Hyphens read as word breaks so the slug works as free text.
    expect(calls[0]!.url.searchParams.get("keyword")).toBe("blue shirt");
    expect(detail!.id).toBe("111");
  });

  it("returns null when no result's slug matches the handle", async () => {
    const { backend } = harness(() =>
      json({ data: [product({ custom_url: { url: "/red-shirt/" } })] }),
    );

    await expect(backend.getProduct("blue-shirt")).resolves.toBeNull();
  });
});

describe("listCollections", () => {
  it("maps v3 categories onto collections with their storefront path", async () => {
    const { backend, calls } = harness(() =>
      json({
        data: [
          category(),
          category({ id: 22, name: "Hats", description: null, custom_url: null }),
        ],
      }),
    );

    const collections = await backend.listCollections!();

    expect(calls[0]!.url.pathname).toBe("/stores/abc123/v3/catalog/categories");
    expect(calls[0]!.url.searchParams.get("limit")).toBe("50");
    expect(collections).toEqual([
      {
        handle: "shirts",
        title: "Shirts",
        description: "Every shirt.",
        path: "/shirts",
      },
      // No custom URL: the id stands in as the handle.
      { handle: "22", title: "Hats", description: "", path: "/22" },
    ]);
  });
});

describe("updateProduct", () => {
  it("PUTs only the fields given, in BigCommerce's field names", async () => {
    const { backend, calls } = harness(() =>
      json({ data: product({ name: "Indigo Shirt" }) }),
    );

    const updated = await backend.updateProduct!("111", {
      title: "Indigo Shirt",
      visible: false,
      tags: ["shirt", " indigo "],
      seo: { description: "An indigo shirt." },
    });

    const put = calls.find((call) => call.init.method === "PUT")!;
    expect(put.url.pathname).toBe("/stores/abc123/v3/catalog/products/111");
    expect(JSON.parse(String(put.init.body))).toEqual({
      name: "Indigo Shirt",
      is_visible: false,
      // Tags are written as the comma-joined merchandising keyword list.
      search_keywords: "shirt,indigo",
      meta_description: "An indigo shirt.",
    });
    // Description and page_title were not named, so they are not sent.
    expect(JSON.parse(String(put.init.body))).not.toHaveProperty("description");
    expect(JSON.parse(String(put.init.body))).not.toHaveProperty("page_title");

    // The write is followed by a full read-back.
    expect(calls.at(-1)!.init.method).toBe("GET");
    expect(calls.at(-1)!.url.searchParams.get("include")).toBe(
      "variants,images,options",
    );
    expect(updated.title).toBe("Indigo Shirt");
  });

  it("writes nothing when no field is named", async () => {
    const { backend, calls } = harness(() => json({ data: product() }));

    await backend.updateProduct!("111", {});

    expect(calls.every((call) => call.init.method === "GET")).toBe(true);
  });

  it("refuses a handle, which BigCommerce cannot address for writes", async () => {
    const { backend, calls } = harness(() => json({ data: product() }));

    await expect(backend.updateProduct!("blue-shirt", { title: "x" })).rejects
      .toBeInstanceOf(CommerceError);
    expect(calls).toHaveLength(0);
  });

  it("fails loudly when the product cannot be read back", async () => {
    const { backend } = harness((_url, init) =>
      init.method === "PUT" ? json({ data: product() }) : json({}, 404),
    );

    await expect(
      backend.updateProduct!("111", { title: "Indigo Shirt" }),
    ).rejects.toBeInstanceOf(CommerceApiError);
  });
});

describe("listOrders", () => {
  it("maps a v2 order onto the agent summary shape", async () => {
    const { backend, calls } = harness(() => json([order()]));

    const [summary] = await backend.listOrders!({ limit: 20, status: "any" });

    expect(calls[0]!.url.pathname).toBe("/stores/abc123/v2/orders");
    expect(calls[0]!.url.searchParams.get("sort")).toBe("date_created:desc");
    expect(calls[0]!.url.searchParams.has("status_id")).toBe(false);
    expect(summary).toEqual({
      id: "1001",
      status: "Awaiting Fulfillment",
      // RFC-2822 in, ISO-8601 out.
      createdAt: "2026-01-20T12:00:00.000Z",
      total: { amount: "45.00", currencyCode: "USD" },
      customer: { name: "Ada Lovelace", email: "ada@example.com" },
      lineCount: 3,
    });
    // v2 needs a request per order for line items, so none is summarised.
    expect(summary).not.toHaveProperty("lineSummary");
  });

  it("omits the customer when the billing address carries no identity", async () => {
    const { backend } = harness(() => json([order({ billing_address: null })]));

    const [summary] = await backend.listOrders!({ limit: 5, status: "any" });

    expect(summary!.customer).toBeUndefined();
  });

  it.each([
    ["completed", "10"],
    ["canceled", "5"],
  ] as const)("filters %s server-side on status_id=%s", async (status, id) => {
    const { backend, calls } = harness(() => json([]));

    await backend.listOrders!({ limit: 10, status });

    expect(calls[0]!.url.searchParams.get("status_id")).toBe(id);
    expect(calls[0]!.url.searchParams.get("limit")).toBe("10");
  });

  it("resolves 'open' client-side over a wider page", async () => {
    const { backend, calls } = harness(() =>
      json([
        order({ id: 1, status_id: 11, status: "Awaiting Fulfillment" }),
        order({ id: 2, status_id: 10, status: "Completed" }),
        order({ id: 3, status_id: 5, status: "Cancelled" }),
        order({ id: 4, status_id: 2, status: "Shipped" }),
        order({ id: 5, status_id: 6, status: "Declined" }),
      ]),
    );

    const open = await backend.listOrders!({ limit: 10, status: "open" });

    expect(calls[0]!.url.searchParams.has("status_id")).toBe(false);
    expect(calls[0]!.url.searchParams.get("limit")).toBe("30");
    expect(open.map((summary) => summary.id)).toEqual(["1", "4"]);
  });

  it("never returns more than the requested limit", async () => {
    const { backend } = harness(() =>
      json(
        Array.from({ length: 6 }, (_value, index) =>
          order({ id: index + 1, status_id: 11 }),
        ),
      ),
    );

    const open = await backend.listOrders!({ limit: 2, status: "open" });

    expect(open).toHaveLength(2);
  });

  it("reads v2's empty 204 as no orders", async () => {
    const { backend } = harness(() => new Response(null, { status: 204 }));

    await expect(
      backend.listOrders!({ limit: 10, status: "any" }),
    ).resolves.toEqual([]);
  });
});

describe("agent tool suite wiring", () => {
  it("generates all five verbs from the backend", async () => {
    const { backend } = harness(() => json({ data: [product()] }));
    const tools = createCommerceAgentTools(backend);

    expect(backend.providerId).toBe("bigcommerce");
    expect(tools.map((tool) => tool.verb)).toEqual([
      "list_products",
      "get_product",
      "list_collections",
      "update_product",
      "list_orders",
    ]);
    expect(
      tools.filter((tool) => tool.access === "write").map((tool) => tool.verb),
    ).toEqual(["update_product"]);
  });

  it("executes through the generated tool", async () => {
    const { backend, calls } = harness(() => json({ data: [product()] }));
    const listProducts = createCommerceAgentTools(backend).find(
      (tool) => tool.verb === "list_products",
    )!;

    const result = (await listProducts.execute({
      query: "shirt",
      limit: 3,
    })) as { id: string }[];

    expect(result[0]!.id).toBe("111");
    expect(calls[0]!.url.searchParams.get("limit")).toBe("3");
  });
});
