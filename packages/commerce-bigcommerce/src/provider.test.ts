import {
  assertProviderShape,
  CommerceApiError,
  CommerceConfigError,
} from "@corte-so/commerce-core";
import { beforeEach, describe, expect, it } from "vitest";

import { storefrontEndpoint, type BigCommerceConfig } from "./fetch.js";
import {
  bigCommerceProviderFromEnv,
  createBigCommerceProvider,
} from "./provider.js";
import type {
  BigCommerceCart,
  BigCommerceCategoryTreeItem,
  BigCommercePage,
  BigCommerceProduct,
} from "./types.js";

const TOKEN = "impersonation-token-do-not-log";

const product = (
  overrides: Partial<BigCommerceProduct> = {},
): BigCommerceProduct => ({
  entityId: 111,
  sku: "SHIRT-BLUE",
  name: "Blue Shirt",
  brand: null,
  plainTextDescription: "A blue shirt.",
  description: "<p>A blue shirt.</p>",
  availabilityV2: { status: "Available", description: "In stock" },
  defaultImage: { url: "https://cdn.example.com/blue.jpg", altText: "Blue" },
  images: null,
  seo: { pageTitle: "", metaDescription: "", metaKeywords: "" },
  path: "/blue-shirt/",
  prices: {
    price: { value: 25, currencyCode: "USD" },
    priceRange: {
      min: { value: 25, currencyCode: "USD" },
      max: { value: 25, currencyCode: "USD" },
    },
  },
  createdAt: { utc: "2026-01-05T00:00:00Z" },
  variants: null,
  productOptions: null,
  ...overrides,
});

const cart = (overrides: Partial<BigCommerceCart> = {}): BigCommerceCart => ({
  entityId: "cart-abc",
  currencyCode: "USD",
  isTaxIncluded: false,
  amount: { value: 25, currencyCode: "USD" },
  lineItems: {
    totalQuantity: 1,
    physicalItems: [
      {
        entityId: "line-1",
        parentEntityId: null,
        productEntityId: 111,
        variantEntityId: 222,
        sku: "SHIRT-BLUE-S",
        name: "Blue Shirt",
        url: "https://store.example.com/blue-shirt/",
        imageUrl: null,
        brand: null,
        quantity: 1,
        listPrice: { value: 25, currencyCode: "USD" },
        extendedListPrice: { value: 25, currencyCode: "USD" },
        extendedSalePrice: null,
        selectedOptions: [],
      },
    ],
    digitalItems: [],
    customItems: [],
  },
  ...overrides,
});

const categoryTree: BigCommerceCategoryTreeItem[] = [
  { entityId: 21, name: "Shirts", path: "/shirts/", hasChildren: false },
];

const aboutPage: BigCommercePage = {
  __typename: "NormalPage",
  entityId: 41,
  name: "About us",
  isVisibleInNavigation: true,
  seo: null,
  path: "/about-us/",
  plainTextSummary: "Who we are.",
  htmlBody: "<p>Who we are.</p>",
};

/** The totals and redirect-URL calls every cart operation ends with. */
const cartHydrationHandlers = {
  getCheckout: () => ({
    site: {
      checkout: {
        subtotal: { value: 25, currencyCode: "USD" },
        taxTotal: { value: 2, currencyCode: "USD" },
        grandTotal: { value: 27, currencyCode: "USD" },
      },
    },
  }),
  createCartRedirectUrls: () => ({
    cart: {
      createCartRedirectUrls: {
        redirectUrls: {
          redirectedCheckoutUrl: "https://store.example.com/checkout/abc",
          embeddedCheckoutUrl: "https://store.example.com/embedded/abc",
          cartUrl: "https://store.example.com/cart/abc",
        },
      },
    },
  }),
};

type Handler = (variables: Record<string, never>) => unknown;
type Call = {
  operation: string;
  variables: Record<string, unknown>;
  url: string;
  headers: Record<string, string>;
  method: string;
};

/**
 * A fetch that answers GraphQL documents by operation name and REST requests
 * by pathname (keyed as `REST <path>`). An unhandled request throws, so a
 * provider change that fires an unexpected call fails loudly.
 */
function testFetch(handlers: Record<string, Handler>) {
  const calls: Call[] = [];

  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const method = init?.method ?? "GET";
    let key: string;
    let variables: Record<string, unknown> = {};

    if (url.endsWith("/graphql")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        query: string;
        variables?: Record<string, unknown>;
      };
      key = /(?:query|mutation)\s+(\w+)/.exec(body.query)?.[1] ?? "unknown";
      variables = body.variables ?? {};
    } else {
      key = `REST ${new URL(url).pathname.replace(/^\/stores\/[^/]+/, "")}`;
    }

    calls.push({ operation: key, variables, url, headers, method });

    const handler = handlers[key];
    if (!handler) {
      throw new Error(`Unhandled request: ${key}`);
    }

    const payload = handler(variables as Record<string, never>);

    if (payload instanceof Response) return payload;

    return new Response(
      JSON.stringify(url.endsWith("/graphql") ? { data: payload } : payload),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  return { impl, calls };
}

function makeProvider(
  handlers: Record<string, Handler>,
  config: Partial<BigCommerceConfig> = {},
) {
  const { impl, calls } = testFetch(handlers);
  const provider = createBigCommerceProvider({
    storeHash: "abc123",
    customerImpersonationToken: TOKEN,
    fetch: impl,
    ...config,
  });

  return { provider, calls };
}

const only = (calls: Call[], operation: string) =>
  calls.filter((call) => call.operation === operation);

describe("provider shape", () => {
  it("agrees with its capability flags", () => {
    const { provider } = makeProvider({});

    expect(() => assertProviderShape(provider)).not.toThrow();
    expect(provider.id).toBe("bigcommerce");
    expect(provider.capabilities).toEqual({
      cart: true,
      checkout: true,
      search: true,
      pages: true,
      menus: true,
      recommendations: true,
      webhooks: false,
    });
    expect(provider.sorting).toContain(provider.defaultSort);
  });
});

describe("endpoint construction", () => {
  it("omits the channel segment for the default channel", () => {
    expect(
      storefrontEndpoint({
        storeHash: "abc123",
        customerImpersonationToken: TOKEN,
      }),
    ).toBe("https://store-abc123.mybigcommerce.com/graphql");

    expect(
      storefrontEndpoint({
        storeHash: "abc123",
        channelId: "1",
        customerImpersonationToken: TOKEN,
      }),
    ).toBe("https://store-abc123.mybigcommerce.com/graphql");
  });

  it("adds the channel segment for any other channel", () => {
    expect(
      storefrontEndpoint({
        storeHash: "abc123",
        channelId: "9",
        customerImpersonationToken: TOKEN,
      }),
    ).toBe("https://store-abc123-9.mybigcommerce.com/graphql");
  });

  it("sends the impersonation token as a bearer credential", async () => {
    const { provider, calls } = makeProvider({
      searchProducts: () => ({
        site: { search: { searchProducts: { products: { edges: [] } } } },
      }),
    });

    await provider.getProducts();

    expect(calls[0]?.url).toBe(
      "https://store-abc123.mybigcommerce.com/graphql",
    );
    expect(calls[0]?.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });
});

describe("catalog reads", () => {
  it("resolves a slug handle through the route query", async () => {
    const { provider, calls } = makeProvider({
      getEntityIdByRoute: () => ({
        site: { route: { node: { __typename: "Product", entityId: 111 } } },
      }),
      getProduct: () => ({ site: { product: product() } }),
    });

    const result = await provider.getProduct("blue-shirt");

    expect(only(calls, "getEntityIdByRoute")[0]?.variables).toEqual({
      path: "/blue-shirt",
    });
    expect(only(calls, "getProduct")[0]?.variables).toEqual({ entityId: 111 });
    expect(result?.id).toBe("111");
    expect(result?.handle).toBe("blue-shirt");
  });

  it("takes a numeric handle as the entity id without a route lookup", async () => {
    const { provider, calls } = makeProvider({
      getProduct: () => ({ site: { product: product() } }),
    });

    await provider.getProduct("111");

    expect(only(calls, "getEntityIdByRoute")).toHaveLength(0);
    expect(only(calls, "getProduct")[0]?.variables).toEqual({ entityId: 111 });
  });

  it("returns null when the route resolves to nothing", async () => {
    const { provider, calls } = makeProvider({
      getEntityIdByRoute: () => ({ site: { route: { node: null } } }),
    });

    expect(await provider.getProduct("ghost")).toBeNull();
    // Retried once with a trailing slash before giving up.
    expect(only(calls, "getEntityIdByRoute").map((c) => c.variables)).toEqual([
      { path: "/ghost" },
      { path: "/ghost/" },
    ]);
  });

  it("passes search query and sort through to searchProducts", async () => {
    const { provider, calls } = makeProvider({
      searchProducts: () => ({
        site: {
          search: {
            searchProducts: { products: { edges: [{ node: product() }] } },
          },
        },
      }),
    });

    await provider.getProducts({
      query: "shirt",
      sortKey: "price",
      reverse: true,
    });

    expect(only(calls, "searchProducts")[0]?.variables).toEqual({
      filters: { searchTerm: "shirt" },
      sort: "HIGHEST_PRICE",
      first: 50,
    });
  });

  it("searches with an empty term and no sort by default", async () => {
    const { provider, calls } = makeProvider({
      searchProducts: () => ({
        site: { search: { searchProducts: { products: { edges: [] } } } },
      }),
    });

    await provider.getProducts();

    expect(only(calls, "searchProducts")[0]?.variables).toEqual({
      filters: { searchTerm: "" },
      sort: null,
      first: 50,
    });
  });

  it("drops hidden products from listings", async () => {
    const hidden = product({
      entityId: 112,
      path: "/prototype/",
      seo: {
        pageTitle: "",
        metaDescription: "",
        metaKeywords: "corte-frontend-hidden",
      },
    });
    const { provider } = makeProvider({
      searchProducts: () => ({
        site: {
          search: {
            searchProducts: {
              products: { edges: [{ node: product() }, { node: hidden }] },
            },
          },
        },
      }),
    });

    expect((await provider.getProducts()).map((p) => p.id)).toEqual(["111"]);
  });

  it("reads collection products through the category sort enum", async () => {
    const { provider, calls } = makeProvider({
      getMenu: () => ({ site: { categoryTree } }),
      getProductsCollection: () => ({
        site: { category: { products: { edges: [{ node: product() }] } } },
      }),
    });

    const products = await provider.getCollectionProducts({
      collection: "shirts",
      sortKey: "relevance",
    });

    expect(only(calls, "getProductsCollection")[0]?.variables).toEqual({
      entityId: 21,
      sortBy: "DEFAULT",
      hideOutOfStock: false,
      first: 50,
    });
    expect(products).toHaveLength(1);
  });

  it("serves the template's homepage collections from newest/featured products", async () => {
    const { provider, calls } = makeProvider({
      getNewestProducts: () => ({
        site: { newestProducts: { edges: [{ node: product() }] } },
      }),
      getFeaturedProducts: () => ({
        site: { featuredProducts: { edges: [] } },
      }),
    });

    await provider.getCollectionProducts({
      collection: "hidden-homepage-carousel",
    });
    await provider.getCollectionProducts({
      collection: "hidden-homepage-featured-items",
    });

    expect(only(calls, "getNewestProducts")[0]?.variables).toEqual({
      first: 10,
    });
    expect(only(calls, "getFeaturedProducts")).toHaveLength(1);
    expect(only(calls, "getMenu")).toHaveLength(0);
  });

  it("returns an empty list for an unknown collection", async () => {
    const { provider } = makeProvider({
      getMenu: () => ({ site: { categoryTree } }),
    });

    expect(
      await provider.getCollectionProducts({ collection: "hats" }),
    ).toEqual([]);
    expect(await provider.getCollection("hats")).toBeNull();
  });

  it("reads each top-level category in full for getCollections", async () => {
    const { provider, calls } = makeProvider({
      getStoreCategories: () => ({ site: { categoryTree } }),
      getCategory: () => ({
        site: {
          category: {
            entityId: 21,
            name: "Shirts",
            path: "/shirts/",
            description: "",
            seo: null,
          },
        },
      }),
    });

    const collections = await provider.getCollections();

    expect(collections.map((collection) => collection.handle)).toEqual([
      "shirts",
    ]);
    expect(only(calls, "getCategory")).toHaveLength(1);
  });

  it("reads related products by entity id", async () => {
    const { provider, calls } = makeProvider({
      getProductRecommendations: () => ({
        site: { product: { relatedProducts: { edges: [{ node: product() }] } } },
      }),
    });

    const related = await provider.getProductRecommendations!("111");

    expect(only(calls, "getProductRecommendations")[0]?.variables).toEqual({
      entityId: 111,
      first: 50,
    });
    expect(related).toHaveLength(1);
  });
});

describe("content reads", () => {
  it("resolves a page through the route query", async () => {
    const { provider } = makeProvider({
      getEntityIdByRoute: () => ({
        site: { route: { node: { __typename: "NormalPage", entityId: 41 } } },
      }),
      getPage: () => ({ site: { content: { page: aboutPage } } }),
    });

    expect((await provider.getPage!("about-us"))?.title).toBe("About us");
  });

  it("falls back to the page list when the route misses", async () => {
    const { provider, calls } = makeProvider({
      getEntityIdByRoute: () => ({ site: { route: { node: null } } }),
      getPages: () => ({
        site: { content: { pages: { edges: [{ node: aboutPage }] } } },
      }),
    });

    expect((await provider.getPage!("about-us"))?.id).toBe("41");
    expect(only(calls, "getPages")).toHaveLength(1);
  });

  it("returns null for a page that exists nowhere", async () => {
    const { provider } = makeProvider({
      getEntityIdByRoute: () => ({ site: { route: { node: null } } }),
      getPages: () => ({ site: { content: { pages: { edges: [] } } } }),
    });

    expect(await provider.getPage!("ghost")).toBeNull();
  });

  it("serves header and footer menus, and nothing for other handles", async () => {
    const { provider } = makeProvider({
      getMenu: () => ({ site: { categoryTree } }),
      getPages: () => ({
        site: { content: { pages: { edges: [{ node: aboutPage }] } } },
      }),
    });

    expect(await provider.getMenu!("header")).toEqual([
      { title: "Shirts", path: "/search/shirts" },
    ]);
    expect(await provider.getMenu!("next-js-frontend-footer-menu")).toEqual([
      { title: "About us", path: "/about-us" },
    ]);
    expect(await provider.getMenu!("sidebar")).toEqual([]);
  });
});

describe("cart", () => {
  it("hands back an empty placeholder cart, since BigCommerce has none", async () => {
    const { provider, calls } = makeProvider({});
    const created = await provider.cart!.createCart();

    expect(created.id).toBe("");
    expect(created.totalQuantity).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("creates the real cart on the first add", async () => {
    const { provider, calls } = makeProvider({
      createCart: () => ({ cart: { createCart: { cart: cart() } } }),
      ...cartHydrationHandlers,
    });

    const result = await provider.cart!.addToCart("", [
      { merchandiseId: "111:222", quantity: 2 },
    ]);

    expect(only(calls, "createCart")[0]?.variables).toEqual({
      createCartInput: {
        lineItems: [
          { productEntityId: 111, variantEntityId: 222, quantity: 2 },
        ],
      },
    });
    expect(result.id).toBe("cart-abc");
    expect(result.checkoutUrl).toBe("https://store.example.com/checkout/abc");
    expect(result.cost.totalAmount).toEqual({
      amount: "27.00",
      currencyCode: "USD",
    });
  });

  it("adds to an existing cart, and omits the variant for a bare id", async () => {
    const { provider, calls } = makeProvider({
      addCartLineItems: () => ({
        cart: { addCartLineItems: { cart: cart() } },
      }),
      ...cartHydrationHandlers,
    });

    await provider.cart!.addToCart("cart-abc", [
      { merchandiseId: "113", quantity: 1 },
    ]);

    expect(only(calls, "addCartLineItems")[0]?.variables).toEqual({
      addCartLineItemsInput: {
        cartEntityId: "cart-abc",
        data: { lineItems: [{ productEntityId: 113, quantity: 1 }] },
      },
    });
  });

  it("reads a cart, and reports an unknown id as null", async () => {
    const { provider } = makeProvider({
      getCart: (variables: { entityId?: string }) => ({
        site: { cart: variables.entityId === "cart-abc" ? cart() : null },
      }),
      ...cartHydrationHandlers,
    });

    const found = await provider.cart!.getCart("cart-abc");
    expect(found?.lines[0]?.merchandise.id).toBe("111:222");
    expect(await provider.cart!.getCart("expired")).toBeNull();
  });

  it("does not call the API for an empty cart id", async () => {
    const { provider, calls } = makeProvider({});

    expect(await provider.cart!.getCart("")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("updates one line per mutation, carrying product and variant", async () => {
    const { provider, calls } = makeProvider({
      updateCartLineItem: () => ({
        cart: { updateCartLineItem: { cart: cart() } },
      }),
      ...cartHydrationHandlers,
    });

    await provider.cart!.updateCart("cart-abc", [
      { id: "line-1", merchandiseId: "111:222", quantity: 3 },
      { id: "line-2", merchandiseId: "113", quantity: 1 },
    ]);

    const updates = only(calls, "updateCartLineItem");
    expect(updates).toHaveLength(2);
    expect(updates[0]?.variables).toEqual({
      updateCartLineItemInput: {
        cartEntityId: "cart-abc",
        lineItemEntityId: "line-1",
        data: {
          lineItem: {
            productEntityId: 111,
            variantEntityId: 222,
            quantity: 3,
          },
        },
      },
    });
    expect(updates[1]?.variables).toMatchObject({
      updateCartLineItemInput: {
        lineItemEntityId: "line-2",
        data: { lineItem: { productEntityId: 113, quantity: 1 } },
      },
    });
  });

  it("removes each line in turn and maps the surviving cart", async () => {
    const { provider, calls } = makeProvider({
      deleteCartLineItem: () => ({
        cart: {
          deleteCartLineItem: {
            deletedLineItemEntityId: "line-1",
            deletedCartEntityId: null,
            cart: cart(),
          },
        },
      }),
      ...cartHydrationHandlers,
    });

    const result = await provider.cart!.removeFromCart("cart-abc", ["line-1"]);

    expect(only(calls, "deleteCartLineItem")[0]?.variables).toEqual({
      deleteCartLineItemInput: {
        cartEntityId: "cart-abc",
        lineItemEntityId: "line-1",
      },
    });
    expect(result.id).toBe("cart-abc");
  });

  it("reports an empty cart once the last line is gone", async () => {
    const { provider, calls } = makeProvider({
      deleteCartLineItem: () => ({
        cart: {
          deleteCartLineItem: {
            deletedLineItemEntityId: "line-1",
            deletedCartEntityId: "cart-abc",
            cart: null,
          },
        },
      }),
    });

    const result = await provider.cart!.removeFromCart("cart-abc", [
      "line-1",
      "line-2",
    ]);

    expect(result.id).toBe("");
    expect(result.lines).toEqual([]);
    // BigCommerce deleted the cart with its last line; nothing left to delete.
    expect(only(calls, "deleteCartLineItem")).toHaveLength(1);
  });

  it("takes the checkout URL from the REST endpoint when an access token is set", async () => {
    const { provider, calls } = makeProvider(
      {
        getCart: () => ({ site: { cart: cart() } }),
        getCheckout: cartHydrationHandlers.getCheckout,
        "REST /v3/carts/cart-abc/redirect_urls": () => ({
          data: {
            cart_url: "https://store.example.com/cart/abc",
            checkout_url: "https://store.example.com/checkout/rest",
            embedded_checkout_url: "https://store.example.com/embedded/abc",
          },
        }),
      },
      { accessToken: "store-access-token" },
    );

    const result = await provider.cart!.getCart("cart-abc");

    expect(result?.checkoutUrl).toBe("https://store.example.com/checkout/rest");

    const rest = only(calls, "REST /v3/carts/cart-abc/redirect_urls")[0];
    expect(rest?.method).toBe("POST");
    expect(rest?.headers["X-Auth-Token"]).toBe("store-access-token");
    expect(only(calls, "createCartRedirectUrls")).toHaveLength(0);
  });
});

describe("errors", () => {
  it("wraps a failed request in CommerceApiError without leaking the token", async () => {
    const { provider } = makeProvider({
      searchProducts: () =>
        new Response(`{"error":"bad token ${TOKEN}"}`, { status: 401 }),
    });

    const error = await provider.getProducts().catch((caught) => caught);

    expect(error).toBeInstanceOf(CommerceApiError);
    expect((error as CommerceApiError).provider).toBe("bigcommerce");
    expect((error as CommerceApiError).status).toBe(401);
    expect((error as CommerceApiError).message).not.toContain(TOKEN);
    expect((error as CommerceApiError).message).toContain("[redacted]");
  });

  it("wraps GraphQL errors", async () => {
    const { provider } = makeProvider({
      searchProducts: () =>
        new Response(
          JSON.stringify({ errors: [{ message: "Unknown field 'foo'" }] }),
          { status: 200 },
        ),
    });

    const error = await provider.getProducts().catch((caught) => caught);

    expect(error).toBeInstanceOf(CommerceApiError);
    expect((error as CommerceApiError).message).toContain("Unknown field");
  });
});

describe("bigCommerceProviderFromEnv", () => {
  const env = {
    BIGCOMMERCE_STORE_HASH: "abc123",
    BIGCOMMERCE_CUSTOMER_IMPERSONATION_TOKEN: TOKEN,
  };

  let calls: Call[];
  let fetchImpl: typeof fetch;

  beforeEach(() => {
    const harness = testFetch({
      searchProducts: () => ({
        site: { search: { searchProducts: { products: { edges: [] } } } },
      }),
    });
    calls = harness.calls;
    fetchImpl = harness.impl;
  });

  it("builds a provider from the two required variables", async () => {
    const provider = bigCommerceProviderFromEnv(env, { fetch: fetchImpl });

    await provider.getProducts();

    expect(calls[0]?.url).toBe(
      "https://store-abc123.mybigcommerce.com/graphql",
    );
  });

  it("names the missing variable", () => {
    expect(() => bigCommerceProviderFromEnv({})).toThrow(CommerceConfigError);
    expect(() => bigCommerceProviderFromEnv({})).toThrow(
      "BIGCOMMERCE_STORE_HASH",
    );
    expect(() =>
      bigCommerceProviderFromEnv({ BIGCOMMERCE_STORE_HASH: "abc123" }),
    ).toThrow("BIGCOMMERCE_CUSTOMER_IMPERSONATION_TOKEN");
  });

  it("reads the optional channel and storefront variables", async () => {
    const provider = bigCommerceProviderFromEnv(
      {
        ...env,
        BIGCOMMERCE_CHANNEL_ID: "9",
        BIGCOMMERCE_STOREFRONT_URL: "https://store.example.com",
      },
      { fetch: fetchImpl },
    );

    await provider.getProducts();

    expect(calls[0]?.url).toBe(
      "https://store-abc123-9.mybigcommerce.com/graphql",
    );
  });

  it("puts the storefront URL on Product.externalUrl", async () => {
    const harness = testFetch({
      searchProducts: () => ({
        site: {
          search: {
            searchProducts: { products: { edges: [{ node: product() }] } },
          },
        },
      }),
    });
    const provider = bigCommerceProviderFromEnv(
      { ...env, BIGCOMMERCE_STOREFRONT_URL: "https://store.example.com" },
      { fetch: harness.impl },
    );

    const [first] = await provider.getProducts();

    expect(first?.externalUrl).toBe("https://store.example.com/blue-shirt");
  });
});
