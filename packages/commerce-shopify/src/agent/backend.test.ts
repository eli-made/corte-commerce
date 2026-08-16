import { CommerceApiError } from "@corte-so/commerce-core";
import { createCommerceAgentTools } from "@corte-so/commerce-agent-tools";
import { describe, expect, it } from "vitest";
import { createShopifyAdminClient } from "./client.js";
import { createShopifyAgentBackend } from "./backend.js";

const TOKEN = "shpat_admin_test_token";
const STORE = "acme.myshopify.com";

/* -------------------------------------------------------------------------- */
/* Fixtures — shaped exactly like the documents in queries.ts.                 */
/* -------------------------------------------------------------------------- */

const adminProductSummary = (overrides: Record<string, unknown> = {}) => ({
  id: "gid://shopify/Product/1",
  handle: "acme-tee",
  title: "Acme Tee",
  status: "ACTIVE",
  tags: ["tee", "cotton"],
  updatedAt: "2026-01-02T03:04:05Z",
  featuredMedia: {
    preview: {
      image: {
        url: "https://cdn.shopify.com/s/files/1/tee-front.jpg",
        altText: null,
      },
    },
  },
  priceRangeV2: {
    minVariantPrice: { amount: "20.00", currencyCode: "USD" },
    maxVariantPrice: { amount: "25.00", currencyCode: "USD" },
  },
  ...overrides,
});

const adminProductDetail = (overrides: Record<string, unknown> = {}) => ({
  ...adminProductSummary(),
  description: "A tee.",
  seo: { title: null, description: null },
  options: [{ id: "gid://shopify/ProductOption/1", name: "Size", values: ["S", "M"] }],
  variants: {
    nodes: [
      {
        id: "gid://shopify/ProductVariant/11",
        title: "S",
        price: "20.00",
        availableForSale: true,
      },
      {
        id: "gid://shopify/ProductVariant/12",
        title: "M",
        price: "25.00",
        availableForSale: false,
      },
    ],
  },
  media: {
    nodes: [
      {
        image: {
          url: "https://cdn.shopify.com/s/files/1/tee-front.jpg",
          altText: "Front",
        },
      },
      // A video sits in the same connection and selects to `{}`.
      {},
      {
        image: {
          url: "https://cdn.shopify.com/s/files/1/tee-back.jpg",
          altText: null,
        },
      },
    ],
  },
  ...overrides,
});

const adminOrder = (overrides: Record<string, unknown> = {}) => ({
  id: "gid://shopify/Order/5001",
  name: "#1001",
  createdAt: "2026-02-03T10:00:00Z",
  cancelledAt: null,
  displayFinancialStatus: "PAID",
  displayFulfillmentStatus: "UNFULFILLED",
  totalPriceSet: { shopMoney: { amount: "65.00", currencyCode: "USD" } },
  customer: { displayName: "Ada Lovelace", email: "ada@example.com" },
  lineItems: {
    nodes: [
      { title: "Acme Tee", quantity: 2 },
      { title: "Belt", quantity: 1 },
    ],
  },
  ...overrides,
});

/* -------------------------------------------------------------------------- */
/* Fake transport                                                             */
/* -------------------------------------------------------------------------- */

type Call = { url: string; query: string; variables: Record<string, unknown> };

type Responder = (call: Call) => unknown;

function harness(responder: Responder | unknown) {
  const calls: Call[] = [];

  const fakeFetch: typeof fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      query: string;
      variables?: Record<string, unknown>;
    };
    const call: Call = {
      url: String(input),
      query: body.query,
      variables: body.variables ?? {},
    };
    calls.push(call);

    const result =
      typeof responder === "function" ? (responder as Responder)(call) : responder;

    if (result instanceof Response) return result;
    return new Response(JSON.stringify({ data: result }), { status: 200 });
  };

  const backend = createShopifyAgentBackend(
    createShopifyAdminClient({
      storeDomain: STORE,
      accessToken: TOKEN,
      apiVersion: "2025-10",
      fetch: fakeFetch,
    }),
  );

  return { backend, calls };
}

/* -------------------------------------------------------------------------- */

describe("listProducts", () => {
  it("maps Admin products onto agent summaries", async () => {
    const { backend, calls } = harness({
      products: {
        nodes: [
          adminProductSummary(),
          adminProductSummary({
            id: "gid://shopify/Product/2",
            handle: "draft-hoodie",
            title: "Draft Hoodie",
            status: "DRAFT",
            tags: [],
            featuredMedia: null,
          }),
        ],
      },
    });

    const products = await backend.listProducts({ limit: 20 });

    expect(products).toEqual([
      {
        id: "gid://shopify/Product/1",
        handle: "acme-tee",
        title: "Acme Tee",
        availableForSale: true,
        priceRange: {
          minVariantPrice: { amount: "20.00", currencyCode: "USD" },
          maxVariantPrice: { amount: "25.00", currencyCode: "USD" },
        },
        tags: ["tee", "cotton"],
        updatedAt: "2026-01-02T03:04:05Z",
        featuredImageUrl: "https://cdn.shopify.com/s/files/1/tee-front.jpg",
        externalUrl: "https://acme.myshopify.com/products/acme-tee",
      },
      {
        id: "gid://shopify/Product/2",
        handle: "draft-hoodie",
        title: "Draft Hoodie",
        // DRAFT is not on sale, and no featured media means no image url.
        availableForSale: false,
        priceRange: {
          minVariantPrice: { amount: "20.00", currencyCode: "USD" },
          maxVariantPrice: { amount: "25.00", currencyCode: "USD" },
        },
        tags: [],
        updatedAt: "2026-01-02T03:04:05Z",
        externalUrl: "https://acme.myshopify.com/products/draft-hoodie",
      },
    ]);

    expect(calls[0]!.url).toBe(
      "https://acme.myshopify.com/admin/api/2025-10/graphql.json",
    );
    expect(calls[0]!.variables.first).toBe(20);
  });

  it("passes the query and reverse flag through", async () => {
    const { backend, calls } = harness({ products: { nodes: [] } });

    await backend.listProducts({ limit: 5, query: "tee", reverse: true });

    expect(calls[0]!.variables).toMatchObject({
      first: 5,
      query: "tee",
      reverse: true,
    });
  });

  it("maps neutral sort keys onto Admin's ProductSortKeys", async () => {
    const cases: {
      sortKey: "relevance" | "best-selling" | "created-at" | "price";
      query?: string;
      expected: string | undefined;
    }[] = [
      { sortKey: "created-at", expected: "CREATED_AT" },
      { sortKey: "relevance", query: "tee", expected: "RELEVANCE" },
      // Shopify documents RELEVANCE as meaningless without a search query.
      { sortKey: "relevance", expected: undefined },
      // Admin's enum has neither of these — omitted rather than substituted.
      { sortKey: "best-selling", expected: undefined },
      { sortKey: "price", expected: undefined },
    ];

    for (const testCase of cases) {
      const { backend, calls } = harness({ products: { nodes: [] } });
      await backend.listProducts({
        limit: 10,
        sortKey: testCase.sortKey,
        ...(testCase.query ? { query: testCase.query } : {}),
      });
      expect(calls[0]!.variables.sortKey).toBe(testCase.expected);
    }
  });
});

describe("getProduct", () => {
  it("fetches by gid when given one", async () => {
    const { backend, calls } = harness({ product: adminProductDetail() });

    const product = await backend.getProduct("gid://shopify/Product/1");

    expect(calls[0]!.variables).toEqual({ id: "gid://shopify/Product/1" });
    expect(product).toMatchObject({
      id: "gid://shopify/Product/1",
      handle: "acme-tee",
      description: "A tee.",
      options: [{ name: "Size", values: ["S", "M"] }],
      // Variant prices are bare decimals; the currency comes from the range.
      variants: [
        {
          id: "gid://shopify/ProductVariant/11",
          title: "S",
          price: { amount: "20.00", currencyCode: "USD" },
          availableForSale: true,
        },
        {
          id: "gid://shopify/ProductVariant/12",
          title: "M",
          price: { amount: "25.00", currencyCode: "USD" },
          availableForSale: false,
        },
      ],
      // Non-image media is dropped; missing alt text falls back to the filename.
      images: [
        { url: "https://cdn.shopify.com/s/files/1/tee-front.jpg", altText: "Front" },
        {
          url: "https://cdn.shopify.com/s/files/1/tee-back.jpg",
          altText: "Acme Tee - tee-back",
        },
      ],
      // Null SEO falls back to the product's own copy.
      seo: { title: "Acme Tee", description: "A tee." },
    });
  });

  it("coerces a numeric id into a gid", async () => {
    const { backend, calls } = harness({ product: adminProductDetail() });

    await backend.getProduct("1");

    expect(calls[0]!.variables).toEqual({ id: "gid://shopify/Product/1" });
    expect(calls[0]!.query).toContain("product(id: $id)");
  });

  it("resolves a handle through a handle: search", async () => {
    const { backend, calls } = harness({
      products: { nodes: [adminProductDetail()] },
    });

    const product = await backend.getProduct("acme-tee");

    expect(calls[0]!.variables).toEqual({ query: 'handle:"acme-tee"' });
    expect(product?.id).toBe("gid://shopify/Product/1");
  });

  it("returns null for an unknown id", async () => {
    const { backend } = harness({ product: null });
    await expect(backend.getProduct("gid://shopify/Product/999")).resolves.toBeNull();
  });

  it("returns null for an unknown handle", async () => {
    const { backend } = harness({ products: { nodes: [] } });
    await expect(backend.getProduct("nope-not-a-handle")).resolves.toBeNull();
  });

  it("does not return a near-miss from the handle search", async () => {
    const { backend } = harness({
      products: { nodes: [adminProductDetail({ handle: "acme-tee-long-sleeve" })] },
    });
    await expect(backend.getProduct("acme-tee")).resolves.toBeNull();
  });
});

describe("listCollections", () => {
  it("maps collections with a storefront path and product count", async () => {
    const { backend, calls } = harness({
      collections: {
        nodes: [
          {
            id: "gid://shopify/Collection/1",
            handle: "shirts",
            title: "Shirts",
            description: "All shirts",
            productsCount: { count: 12 },
          },
          {
            id: "gid://shopify/Collection/2",
            handle: "belts",
            title: "Belts",
            description: "",
            productsCount: null,
          },
        ],
      },
    });

    await expect(backend.listCollections!()).resolves.toEqual([
      {
        handle: "shirts",
        title: "Shirts",
        description: "All shirts",
        path: "/search/shirts",
        productCount: 12,
      },
      {
        handle: "belts",
        title: "Belts",
        description: "",
        path: "/search/belts",
      },
    ]);
    expect(calls[0]!.variables).toEqual({ first: 50 });
  });
});

describe("updateProduct", () => {
  it("sends only the fields that changed, mapped onto ProductUpdateInput", async () => {
    const { backend, calls } = harness({
      productUpdate: { product: adminProductDetail(), userErrors: [] },
    });

    await backend.updateProduct!("gid://shopify/Product/1", {
      title: "Acme Tee (Organic)",
      description: "<p>Now organic.</p>",
      tags: ["tee", "organic"],
      visible: false,
      seo: { description: "Organic cotton tee" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.query).toContain("productUpdate(product: $product)");
    expect(calls[0]!.variables).toEqual({
      product: {
        id: "gid://shopify/Product/1",
        title: "Acme Tee (Organic)",
        descriptionHtml: "<p>Now organic.</p>",
        tags: ["tee", "organic"],
        status: "DRAFT",
        seo: { description: "Organic cotton tee" },
      },
    });
  });

  it("maps visible: true onto ACTIVE and omits untouched fields", async () => {
    const { backend, calls } = harness({
      productUpdate: { product: adminProductDetail(), userErrors: [] },
    });

    await backend.updateProduct!("gid://shopify/Product/1", { visible: true });

    expect(calls[0]!.variables).toEqual({
      product: { id: "gid://shopify/Product/1", status: "ACTIVE" },
    });
  });

  it("resolves a handle to an id before mutating", async () => {
    const { backend, calls } = harness((call) =>
      call.query.includes("mutation")
        ? { productUpdate: { product: adminProductDetail(), userErrors: [] } }
        : { products: { nodes: [{ id: "gid://shopify/Product/1" }] } },
    );

    await backend.updateProduct!("acme-tee", { title: "Acme Tee" });

    expect(calls[0]!.variables).toEqual({ query: 'handle:"acme-tee"' });
    expect(calls[1]!.variables).toEqual({
      product: { id: "gid://shopify/Product/1", title: "Acme Tee" },
    });
  });

  it("returns the refreshed product detail", async () => {
    const { backend } = harness({
      productUpdate: {
        product: adminProductDetail({ title: "Acme Tee (Organic)" }),
        userErrors: [],
      },
    });

    const updated = await backend.updateProduct!("gid://shopify/Product/1", {
      title: "Acme Tee (Organic)",
    });

    expect(updated.title).toBe("Acme Tee (Organic)");
    expect(updated.externalUrl).toBe("https://acme.myshopify.com/products/acme-tee");
  });

  it("turns userErrors into a CommerceApiError", async () => {
    const { backend } = harness({
      productUpdate: {
        product: null,
        userErrors: [
          { field: ["title"], message: "Title can't be blank" },
          { field: null, message: "Something else" },
        ],
      },
    });

    const error = await backend
      .updateProduct!("gid://shopify/Product/1", { title: "" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CommerceApiError);
    expect((error as CommerceApiError).provider).toBe("shopify");
    expect((error as CommerceApiError).message).toContain("Title can't be blank");
    expect((error as CommerceApiError).message).toContain("Something else");
  });

  it("fails when a handle cannot be resolved", async () => {
    const { backend } = harness({ products: { nodes: [] } });

    const error = await backend
      .updateProduct!("nope-not-a-handle", { title: "x" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CommerceApiError);
    expect((error as CommerceApiError).status).toBe(404);
  });
});

describe("listOrders", () => {
  it("maps orders onto agent summaries", async () => {
    const { backend, calls } = harness({ orders: { nodes: [adminOrder()] } });

    const orders = await backend.listOrders!({ limit: 20, status: "any" });

    expect(orders).toEqual([
      {
        id: "gid://shopify/Order/5001",
        number: "#1001",
        status: "Paid · Unfulfilled",
        createdAt: "2026-02-03T10:00:00Z",
        total: { amount: "65.00", currencyCode: "USD" },
        customer: { name: "Ada Lovelace", email: "ada@example.com" },
        lineCount: 2,
        lineSummary: "2× Acme Tee, 1× Belt",
      },
    ]);
    // "any" sends no status filter at all.
    expect(calls[0]!.variables.query).toBeUndefined();
    expect(calls[0]!.variables.first).toBe(20);
    expect(calls[0]!.query).toContain("sortKey: CREATED_AT, reverse: true");
  });

  it("truncates the line summary after three items", async () => {
    const { backend } = harness({
      orders: {
        nodes: [
          adminOrder({
            lineItems: {
              nodes: [
                { title: "Tee", quantity: 2 },
                { title: "Belt", quantity: 1 },
                { title: "Cap", quantity: 3 },
                { title: "Socks", quantity: 1 },
                { title: "Scarf", quantity: 1 },
              ],
            },
          }),
        ],
      },
    });

    const [order] = await backend.listOrders!({ limit: 20, status: "any" });

    expect(order!.lineSummary).toBe("2× Tee, 1× Belt, 3× Cap, +2 more");
    expect(order!.lineCount).toBe(5);
  });

  it("reports a cancelled order as canceled regardless of payment state", async () => {
    const { backend } = harness({
      orders: {
        nodes: [
          adminOrder({
            cancelledAt: "2026-02-04T09:00:00Z",
            displayFinancialStatus: "REFUNDED",
          }),
        ],
      },
    });

    const [order] = await backend.listOrders!({ limit: 20, status: "canceled" });
    expect(order!.status).toBe("Canceled");
  });

  it("humanizes multi-word status enums", async () => {
    const { backend } = harness({
      orders: {
        nodes: [
          adminOrder({
            displayFinancialStatus: "PARTIALLY_REFUNDED",
            displayFulfillmentStatus: "PARTIALLY_FULFILLED",
          }),
        ],
      },
    });

    const [order] = await backend.listOrders!({ limit: 20, status: "any" });
    expect(order!.status).toBe("Partially refunded · Partially fulfilled");
  });

  it("omits customer and line summary when the order carries neither", async () => {
    const { backend } = harness({
      orders: {
        nodes: [adminOrder({ customer: null, lineItems: { nodes: [] } })],
      },
    });

    const [order] = await backend.listOrders!({ limit: 20, status: "any" });
    expect(order!.customer).toBeUndefined();
    expect(order!.lineSummary).toBeUndefined();
    expect(order!.lineCount).toBe(0);
  });

  it("maps the suite's status filter onto Shopify's order search syntax", async () => {
    const cases: {
      status: "any" | "open" | "completed" | "canceled";
      expected: string | undefined;
    }[] = [
      { status: "any", expected: undefined },
      { status: "open", expected: "status:open" },
      { status: "completed", expected: "status:closed" },
      { status: "canceled", expected: "status:cancelled" },
    ];

    for (const testCase of cases) {
      const { backend, calls } = harness({ orders: { nodes: [] } });
      await backend.listOrders!({ limit: 10, status: testCase.status });
      expect(calls[0]!.variables.query).toBe(testCase.expected);
    }
  });
});

describe("agent tool suite wiring", () => {
  it("generates all five verbs for Shopify", () => {
    const { backend } = harness({});
    const tools = createCommerceAgentTools(backend);

    expect(backend.providerId).toBe("shopify");
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

  it("runs a generated tool end to end", async () => {
    const { backend, calls } = harness({
      products: { nodes: [adminProductSummary()] },
    });
    const listProducts = createCommerceAgentTools(backend).find(
      (tool) => tool.verb === "list_products",
    )!;

    const result = (await listProducts.execute({ query: "tee" })) as {
      handle: string;
    }[];

    expect(result[0]!.handle).toBe("acme-tee");
    // The suite's default limit reaches the Admin query.
    expect(calls[0]!.variables.first).toBe(20);
  });
});
