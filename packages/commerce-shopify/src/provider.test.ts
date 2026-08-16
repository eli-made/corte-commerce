import { assertProviderShape, CommerceApiError } from "@corte-so/commerce-core";
import { describe, expect, it } from "vitest";
import { createShopifyProvider } from "./provider.js";
import type { ShopifyProviderConfig } from "./config.js";

const TOKEN = "shpat-test-token";
const STORE = "acme.myshopify.com";

/* -------------------------------------------------------------------------- */
/* Fixtures — shaped exactly like the documents in queries/ and mutations/.    */
/* -------------------------------------------------------------------------- */

const image = (url: string, altText: string | null = null) => ({
  url,
  altText,
  width: 1000,
  height: 1000,
});

const shopifyProduct = (overrides: Record<string, unknown> = {}) => ({
  id: "gid://shopify/Product/1",
  handle: "acme-tee",
  availableForSale: true,
  title: "Acme Tee",
  description: "A tee.",
  descriptionHtml: "<p>A tee.</p>",
  options: [{ id: "gid://shopify/ProductOption/1", name: "Size", values: ["S", "M"] }],
  priceRange: {
    maxVariantPrice: { amount: "25.00", currencyCode: "USD" },
    minVariantPrice: { amount: "20.00", currencyCode: "USD" },
  },
  variants: {
    edges: [
      {
        node: {
          id: "gid://shopify/ProductVariant/11",
          title: "S",
          availableForSale: true,
          selectedOptions: [{ name: "Size", value: "S" }],
          price: { amount: "20.00", currencyCode: "USD" },
        },
      },
    ],
  },
  featuredImage: image("https://cdn.shopify.com/s/files/1/tee-front.jpg"),
  images: { edges: [{ node: image("https://cdn.shopify.com/s/files/1/tee-front.jpg") }] },
  seo: { title: null, description: null },
  tags: [],
  updatedAt: "2026-01-02T03:04:05Z",
  ...overrides,
});

const shopifyCart = (overrides: Record<string, unknown> = {}) => ({
  id: "gid://shopify/Cart/abc123",
  checkoutUrl: "https://acme.myshopify.com/cart/c/abc123",
  cost: {
    subtotalAmount: { amount: "20.00", currencyCode: "EUR" },
    totalAmount: { amount: "20.00", currencyCode: "EUR" },
    totalTaxAmount: null,
  },
  lines: {
    edges: [
      {
        node: {
          id: "gid://shopify/CartLine/1",
          quantity: 2,
          cost: { totalAmount: { amount: "40.00", currencyCode: "EUR" } },
          merchandise: {
            id: "gid://shopify/ProductVariant/11",
            title: "S",
            selectedOptions: [{ name: "Size", value: "S" }],
            product: {
              id: "gid://shopify/Product/1",
              handle: "acme-tee",
              title: "Acme Tee",
              featuredImage: image("https://cdn.shopify.com/s/files/1/tee-front.jpg"),
            },
          },
        },
      },
    ],
  },
  totalQuantity: 2,
  ...overrides,
});

/* -------------------------------------------------------------------------- */
/* Fake transport                                                             */
/* -------------------------------------------------------------------------- */

type Call = { url: string; query: string; variables: Record<string, unknown> };

type Responder = (call: Call) => unknown;

function harness(
  responder: Responder | unknown,
  config: Partial<ShopifyProviderConfig> = {},
) {
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
    return new Response(JSON.stringify({ data: result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const provider = createShopifyProvider({
    storeDomain: STORE,
    storefrontAccessToken: TOKEN,
    fetch: fakeFetch,
    ...config,
  });

  return { provider, calls };
}

/* -------------------------------------------------------------------------- */

describe("provider shape", () => {
  it("satisfies the core contract", () => {
    const { provider } = harness({});
    expect(() => assertProviderShape(provider)).not.toThrow();
    expect(provider.id).toBe("shopify");
    expect(provider.capabilities).toEqual({
      cart: true,
      checkout: true,
      search: true,
      pages: true,
      menus: true,
      recommendations: true,
      webhooks: true,
    });
  });

  it("exposes the neutral sort vocabulary with Relevance as the default", () => {
    const { provider } = harness({});
    expect(provider.sorting.map((option) => option.slug)).toEqual([
      null,
      "trending-desc",
      "latest-desc",
      "price-asc",
      "price-desc",
    ]);
    expect(provider.defaultSort.sortKey).toBe("relevance");
    expect(provider.sorting.map((option) => option.sortKey)).toEqual([
      "relevance",
      "best-selling",
      "created-at",
      "price",
      "price",
    ]);
  });
});

describe("transport", () => {
  it("posts to the versioned Storefront endpoint with the access token header", async () => {
    let seenHeaders: Record<string, string> = {};
    const provider = createShopifyProvider({
      storeDomain: "https://acme.myshopify.com/",
      storefrontAccessToken: TOKEN,
      apiVersion: "2025-10",
      fetch: async (_input, init) => {
        seenHeaders = (init?.headers ?? {}) as Record<string, string>;
        return new Response(JSON.stringify({ data: { products: { edges: [] } } }));
      },
    });

    await provider.getProducts();
    expect(seenHeaders["X-Shopify-Storefront-Access-Token"]).toBe(TOKEN);
    expect(seenHeaders["Content-Type"]).toBe("application/json");
  });

  it("builds the endpoint from a normalized domain", async () => {
    const { provider, calls } = harness(
      { products: { edges: [] } },
      { storeDomain: "https://acme.myshopify.com/", apiVersion: "2025-10" },
    );
    await provider.getProducts();
    expect(calls[0]!.url).toBe(
      "https://acme.myshopify.com/api/2025-10/graphql.json",
    );
  });

  it("turns GraphQL errors into CommerceApiError without leaking the token", async () => {
    const provider = createShopifyProvider({
      storeDomain: STORE,
      storefrontAccessToken: TOKEN,
      fetch: async () =>
        new Response(
          JSON.stringify({ errors: [{ message: `bad token ${TOKEN}` }] }),
          { status: 200 },
        ),
    });

    const error = await provider.getProducts().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CommerceApiError);
    const apiError = error as CommerceApiError;
    expect(apiError.provider).toBe("shopify");
    expect(apiError.message).toContain("[redacted]");
    expect(apiError.message).not.toContain(TOKEN);
  });

  it("carries the HTTP status through on non-2xx responses", async () => {
    const provider = createShopifyProvider({
      storeDomain: STORE,
      storefrontAccessToken: TOKEN,
      fetch: async () =>
        new Response(JSON.stringify({ errors: "Invalid API key or access token" }), {
          status: 401,
        }),
    });

    const error = (await provider
      .getProducts()
      .catch((e: unknown) => e)) as CommerceApiError;
    expect(error).toBeInstanceOf(CommerceApiError);
    expect(error.status).toBe(401);
    expect(error.message).toContain("Invalid API key");
  });
});

describe("getProducts", () => {
  it("reshapes edges and adds an externalUrl", async () => {
    const { provider } = harness({
      products: { edges: [{ node: shopifyProduct() }] },
    });

    const products = await provider.getProducts();
    expect(products).toHaveLength(1);
    const product = products[0]!;
    expect(product.handle).toBe("acme-tee");
    expect(product.externalUrl).toBe("https://acme.myshopify.com/products/acme-tee");
    expect(product.variants).toHaveLength(1);
    expect(product.variants[0]!.price).toEqual({
      amount: "20.00",
      currencyCode: "USD",
    });
    expect(product.images).toHaveLength(1);
    // altText falls back to "<title> - <filename>"
    expect(product.images[0]!.altText).toBe("Acme Tee - tee-front");
    // seo falls back to the product's own title/description
    expect(product.seo).toEqual({ title: "Acme Tee", description: "A tee." });
  });

  it("filters out products carrying the hidden tag", async () => {
    const { provider } = harness({
      products: {
        edges: [
          { node: shopifyProduct() },
          {
            node: shopifyProduct({
              id: "gid://shopify/Product/2",
              handle: "secret",
              tags: ["corte-frontend-hidden"],
            }),
          },
        ],
      },
    });

    const products = await provider.getProducts();
    expect(products.map((product) => product.handle)).toEqual(["acme-tee"]);
  });

  it("maps the neutral sort key onto Shopify's ProductSortKeys", async () => {
    const { provider, calls } = harness({ products: { edges: [] } });
    await provider.getProducts({ query: "tee", sortKey: "created-at", reverse: true });
    expect(calls[0]!.variables).toEqual({
      query: "tee",
      sortKey: "CREATED_AT",
      reverse: true,
    });
  });
});

describe("getProduct", () => {
  it("returns null when Shopify has no product for the handle", async () => {
    const { provider } = harness({ product: null });
    await expect(provider.getProduct("nope")).resolves.toBeNull();
  });

  it("returns hidden-tagged products when fetched by handle", async () => {
    const { provider } = harness({
      product: shopifyProduct({ tags: ["corte-frontend-hidden"] }),
    });
    const product = await provider.getProduct("acme-tee");
    expect(product?.handle).toBe("acme-tee");
  });
});

describe("collections", () => {
  it("prepends the All collection and drops hidden-* handles", async () => {
    const { provider } = harness({
      collections: {
        edges: [
          {
            node: {
              handle: "shirts",
              title: "Shirts",
              description: "Shirts",
              seo: { title: "Shirts", description: "All shirts" },
              updatedAt: "2026-01-01T00:00:00Z",
            },
          },
          {
            node: {
              handle: "hidden-homepage-carousel",
              title: "Carousel",
              description: "",
              seo: null,
              updatedAt: "2026-01-01T00:00:00Z",
            },
          },
        ],
      },
    });

    const collections = await provider.getCollections();
    expect(collections.map((collection) => collection.handle)).toEqual(["", "shirts"]);
    expect(collections[0]!.path).toBe("/search");
    expect(collections[1]!.path).toBe("/search/shirts");
  });

  it("maps created-at to the collection enum's CREATED", async () => {
    const { provider, calls } = harness({ collection: { products: { edges: [] } } });
    await provider.getCollectionProducts({
      collection: "shirts",
      sortKey: "created-at",
      reverse: true,
    });
    expect(calls[0]!.variables).toEqual({
      handle: "shirts",
      sortKey: "CREATED",
      reverse: true,
    });
  });

  it("returns an empty list for an unknown collection", async () => {
    const { provider } = harness({ collection: null });
    await expect(
      provider.getCollectionProducts({ collection: "ghost" }),
    ).resolves.toEqual([]);
  });
});

describe("menus and pages", () => {
  it("rewrites menu URLs into storefront-local paths", async () => {
    const { provider } = harness({
      menu: {
        items: [
          { title: "Shirts", url: "https://acme.myshopify.com/collections/shirts" },
          { title: "About", url: "https://acme.myshopify.com/pages/about" },
        ],
      },
    });

    await expect(provider.getMenu!("main-menu")).resolves.toEqual([
      { title: "Shirts", path: "/search/shirts" },
      { title: "About", path: "/about" },
    ]);
  });

  it("returns null for a missing page", async () => {
    const { provider } = harness({ pageByHandle: null });
    await expect(provider.getPage!("nope")).resolves.toBeNull();
  });
});

describe("cart", () => {
  it("creates a cart and zeroes tax in the cart's own currency", async () => {
    const { provider, calls } = harness({ cartCreate: { cart: shopifyCart() } });

    const cart = await provider.cart!.createCart();
    expect(calls[0]!.query).toContain("mutation createCart");
    expect(cart.id).toBe("gid://shopify/Cart/abc123");
    expect(cart.cost.totalTaxAmount).toEqual({ amount: "0.0", currencyCode: "EUR" });
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]!.merchandise.product).toEqual({
      id: "gid://shopify/Product/1",
      handle: "acme-tee",
      title: "Acme Tee",
      featuredImage: {
        url: "https://cdn.shopify.com/s/files/1/tee-front.jpg",
        altText: "Acme Tee - tee-front",
        width: 1000,
        height: 1000,
      },
    });
  });

  it("passes tax through when Shopify computed it", async () => {
    const { provider } = harness({
      cartCreate: {
        cart: shopifyCart({
          cost: {
            subtotalAmount: { amount: "20.00", currencyCode: "EUR" },
            totalAmount: { amount: "24.00", currencyCode: "EUR" },
            totalTaxAmount: { amount: "4.00", currencyCode: "EUR" },
          },
        }),
      },
    });
    const cart = await provider.cart!.createCart();
    expect(cart.cost.totalTaxAmount).toEqual({ amount: "4.00", currencyCode: "EUR" });
  });

  it("adds lines against an explicit cart id", async () => {
    const { provider, calls } = harness({ cartLinesAdd: { cart: shopifyCart() } });

    const cart = await provider.cart!.addToCart("gid://shopify/Cart/abc123", [
      { merchandiseId: "gid://shopify/ProductVariant/11", quantity: 2 },
    ]);

    expect(calls[0]!.variables).toEqual({
      cartId: "gid://shopify/Cart/abc123",
      lines: [{ merchandiseId: "gid://shopify/ProductVariant/11", quantity: 2 }],
    });
    expect(cart.totalQuantity).toBe(2);
  });

  it("updates lines", async () => {
    const { provider, calls } = harness({ cartLinesUpdate: { cart: shopifyCart() } });

    await provider.cart!.updateCart("gid://shopify/Cart/abc123", [
      {
        id: "gid://shopify/CartLine/1",
        merchandiseId: "gid://shopify/ProductVariant/11",
        quantity: 3,
      },
    ]);

    expect(calls[0]!.query).toContain("mutation editCartItems");
    expect(calls[0]!.variables.cartId).toBe("gid://shopify/Cart/abc123");
  });

  it("removes lines", async () => {
    const { provider, calls } = harness({ cartLinesRemove: { cart: shopifyCart() } });

    await provider.cart!.removeFromCart("gid://shopify/Cart/abc123", [
      "gid://shopify/CartLine/1",
    ]);

    expect(calls[0]!.variables).toEqual({
      cartId: "gid://shopify/Cart/abc123",
      lineIds: ["gid://shopify/CartLine/1"],
    });
  });

  it("returns null for an unknown or checked-out cart id", async () => {
    const { provider } = harness({ cart: null });
    await expect(provider.cart!.getCart("gid://shopify/Cart/gone")).resolves.toBeNull();
  });

  it("reads an existing cart", async () => {
    const { provider } = harness({ cart: shopifyCart() });
    const cart = await provider.cart!.getCart("gid://shopify/Cart/abc123");
    expect(cart?.checkoutUrl).toBe("https://acme.myshopify.com/cart/c/abc123");
  });
});

describe("recommendations", () => {
  it("reshapes the recommendation list", async () => {
    const { provider } = harness({ productRecommendations: [shopifyProduct()] });
    const products = await provider.getProductRecommendations!(
      "gid://shopify/Product/1",
    );
    expect(products.map((product) => product.handle)).toEqual(["acme-tee"]);
  });

  it("tolerates a null recommendation list", async () => {
    const { provider } = harness({ productRecommendations: null });
    await expect(
      provider.getProductRecommendations!("gid://shopify/Product/1"),
    ).resolves.toEqual([]);
  });
});
