import { describe, expect, it } from "vitest";
import {
  CommerceApiError,
  CommerceConfigError,
  assertProviderShape,
} from "@corte-so/commerce-core";
import { MAX_PRODUCT_PAGES } from "./constants.js";
import {
  createSquarespaceProvider,
  squarespaceProviderFromEnv,
} from "./provider.js";
import type { SquarespaceProduct, SquarespaceProductsResponse } from "./types.js";

const API_KEY = "sq-test-key-do-not-leak";

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
    seoOptions: { title: overrides.name, description: "" },
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
  variants: [priced("120.00")],
});

const linenShirt = makeProduct({
  id: "prod-shirt",
  name: "Linen Camp Shirt",
  tags: ["shirts", "summer"],
  createdOn: "2026-03-05T00:00:00.000Z",
  variants: [
    {
      id: "var-shirt",
      sku: "SKU-SHIRT",
      pricing: {
        basePrice: { currency: "USD", value: "89.00" },
        salePrice: { currency: "USD", value: "59.00" },
        onSale: true,
      },
      stock: { quantity: 2, unlimited: false },
    },
  ],
});

const hiddenSample = makeProduct({
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

const PAGE_ONE: SquarespaceProductsResponse = {
  products: [alpineTote, linenShirt],
  pagination: {
    hasNextPage: true,
    nextPageCursor: "cursor-page-2",
    nextPageUrl:
      "https://api.squarespace.com/1.0/commerce/products?cursor=cursor-page-2",
  },
};

const PAGE_TWO: SquarespaceProductsResponse = {
  products: [hiddenSample, woolScarf],
  pagination: { hasNextPage: false, nextPageCursor: null, nextPageUrl: null },
};

type Reply = { status?: number; body?: unknown; text?: string };

function makeFetch(handler: (url: URL) => Reply) {
  const calls: { url: URL; headers: Record<string, string> }[] = [];
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const { status = 200, body, text } = handler(url);
    const payload = text ?? JSON.stringify(body ?? {});
    return new Response(payload, {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** Two-page catalog, plus single-product lookups by id. */
function catalogFetch() {
  return makeFetch((url) => {
    if (url.pathname === "/1.0/commerce/products") {
      return {
        body: url.searchParams.get("cursor") === "cursor-page-2" ? PAGE_TWO : PAGE_ONE,
      };
    }
    const id = url.pathname.split("/").pop();
    const found = [alpineTote, linenShirt, hiddenSample, woolScarf].find(
      (product) => product.id === id,
    );
    return found ? { body: { products: [found] } } : { status: 404, body: { message: "Not found" } };
  });
}

function makeProvider(fetchImpl: typeof fetch, storeDomain?: string) {
  return createSquarespaceProvider({ apiKey: API_KEY, storeDomain, fetch: fetchImpl });
}

describe("provider shape", () => {
  const provider = makeProvider(catalogFetch().fetchImpl);

  it("satisfies the core contract", () => {
    expect(() => assertProviderShape(provider)).not.toThrow();
    expect(provider.id).toBe("squarespace");
  });

  it("declares catalog-only capabilities", () => {
    expect(provider.capabilities).toEqual({
      cart: false,
      checkout: false,
      search: false,
      pages: false,
      menus: false,
      recommendations: false,
      webhooks: false,
    });
  });

  it("exposes no cart or other non-catalog operations", () => {
    expect("cart" in provider).toBe(false);
    expect(provider.cart).toBeUndefined();
    expect(provider.getMenu).toBeUndefined();
    expect(provider.getPage).toBeUndefined();
    expect(provider.getPages).toBeUndefined();
    expect(provider.getProductRecommendations).toBeUndefined();
    expect(provider.webhooks).toBeUndefined();
  });

  it("offers only sort options it can honor", () => {
    expect(provider.sorting.map((option) => option.slug)).toEqual([
      null,
      "latest-desc",
      "price-asc",
      "price-desc",
    ]);
    expect(provider.sorting).toContain(provider.defaultSort);
  });
});

describe("getProducts", () => {
  it("follows pagination cursors until the catalog is exhausted", async () => {
    const { fetchImpl, calls } = catalogFetch();
    const products = await makeProvider(fetchImpl).getProducts();

    expect(calls).toHaveLength(2);
    expect(calls[0]!.url.searchParams.get("cursor")).toBeNull();
    expect(calls[1]!.url.searchParams.get("cursor")).toBe("cursor-page-2");
    expect(products.map((product) => product.title)).toEqual([
      "Alpine Tote",
      "Linen Camp Shirt",
      "Wool Scarf",
    ]);
  });

  it("authenticates with a bearer token", async () => {
    const { fetchImpl, calls } = catalogFetch();
    await makeProvider(fetchImpl).getProducts();
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${API_KEY}`);
  });

  it("drops products carrying the hidden tag", async () => {
    const products = await makeProvider(catalogFetch().fetchImpl).getProducts();
    expect(products.map((product) => product.id)).not.toContain("prod-hidden");
  });

  it("filters client-side by lowercased name substring", async () => {
    const provider = makeProvider(catalogFetch().fetchImpl);
    expect(
      (await provider.getProducts({ query: "SHIRT" })).map((p) => p.title),
    ).toEqual(["Linen Camp Shirt"]);
    expect(await provider.getProducts({ query: "nothing here" })).toEqual([]);
  });

  it("sorts by effective price in both directions", async () => {
    const provider = makeProvider(catalogFetch().fetchImpl);
    expect(
      (await provider.getProducts({ sortKey: "price" })).map((p) => p.title),
    ).toEqual(["Wool Scarf", "Linen Camp Shirt", "Alpine Tote"]);
    expect(
      (await provider.getProducts({ sortKey: "price", reverse: true })).map(
        (p) => p.title,
      ),
    ).toEqual(["Alpine Tote", "Linen Camp Shirt", "Wool Scarf"]);
  });

  it("sorts by creation date", async () => {
    const provider = makeProvider(catalogFetch().fetchImpl);
    expect(
      (await provider.getProducts({ sortKey: "created-at", reverse: true })).map(
        (p) => p.title,
      ),
    ).toEqual(["Linen Camp Shirt", "Wool Scarf", "Alpine Tote"]);
  });

  it("leaves API order alone for relevance and best-selling", async () => {
    const provider = makeProvider(catalogFetch().fetchImpl);
    const apiOrder = ["Alpine Tote", "Linen Camp Shirt", "Wool Scarf"];
    expect((await provider.getProducts({ sortKey: "relevance" })).map((p) => p.title)).toEqual(
      apiOrder,
    );
    expect(
      (await provider.getProducts({ sortKey: "best-selling" })).map((p) => p.title),
    ).toEqual(apiOrder);
  });

  it("builds externalUrl from the store domain for catalog-only linking", async () => {
    const { fetchImpl } = makeFetch((url) =>
      url.pathname === "/1.0/commerce/products"
        ? {
            body: {
              products: [makeProduct({ id: "prod-rel", name: "Rel", url: "/store/p/rel" })],
              pagination: { hasNextPage: false },
            },
          }
        : { status: 404, body: {} },
    );
    const [product] = await makeProvider(fetchImpl, "shop.example.com/").getProducts();
    expect(product!.externalUrl).toBe("https://shop.example.com/store/p/rel");
  });
});

describe("pagination safety", () => {
  it("stops after the documented page cap", async () => {
    let page = 0;
    const { fetchImpl, calls } = makeFetch(() => {
      page += 1;
      return {
        body: {
          products: [makeProduct({ id: `p-${page}`, name: `Product ${page}` })],
          pagination: { hasNextPage: true, nextPageCursor: `cursor-${page}` },
        },
      };
    });

    const products = await makeProvider(fetchImpl).getProducts();
    expect(calls).toHaveLength(MAX_PRODUCT_PAGES);
    expect(products).toHaveLength(MAX_PRODUCT_PAGES);
  });

  it("stops when the API repeats a cursor", async () => {
    const { fetchImpl, calls } = makeFetch(() => ({
      body: {
        products: [makeProduct({ id: "p-loop", name: "Loop" })],
        pagination: { hasNextPage: true, nextPageCursor: "same-cursor" },
      },
    }));

    await makeProvider(fetchImpl).getProducts();
    expect(calls).toHaveLength(2);
  });
});

describe("getProduct", () => {
  it("returns a mapped product by id", async () => {
    const product = await makeProvider(catalogFetch().fetchImpl).getProduct("prod-shirt");
    expect(product?.title).toBe("Linen Camp Shirt");
    expect(product?.handle).toBe("prod-shirt");
    expect(product?.priceRange.minVariantPrice).toEqual({
      amount: "59.00",
      currencyCode: "USD",
    });
  });

  it("returns null on 404", async () => {
    expect(await makeProvider(catalogFetch().fetchImpl).getProduct("nope")).toBeNull();
  });

  it("returns null for an empty handle without calling the API", async () => {
    const { fetchImpl, calls } = catalogFetch();
    expect(await makeProvider(fetchImpl).getProduct("  ")).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("tag-derived collections", () => {
  it("turns tags into collections and skips hidden ones", async () => {
    const collections = await makeProvider(catalogFetch().fetchImpl).getCollections();
    expect(collections.map((collection) => collection.handle)).toEqual([
      "bags",
      "summer",
      "shirts",
      "accessories",
    ]);
    expect(collections[0]).toMatchObject({
      handle: "bags",
      title: "bags",
      path: "/search/bags",
    });
  });

  it("finds one collection by handle and returns null otherwise", async () => {
    const provider = makeProvider(catalogFetch().fetchImpl);
    expect((await provider.getCollection("summer"))?.path).toBe("/search/summer");
    expect(await provider.getCollection("hidden-internal")).toBeNull();
    expect(await provider.getCollection("unknown")).toBeNull();
  });

  it("lists the products carrying a tag, sorted", async () => {
    const provider = makeProvider(catalogFetch().fetchImpl);
    expect(
      (await provider.getCollectionProducts({ collection: "summer" })).map(
        (product) => product.title,
      ),
    ).toEqual(["Alpine Tote", "Linen Camp Shirt"]);
    expect(
      (
        await provider.getCollectionProducts({
          collection: "summer",
          sortKey: "price",
        })
      ).map((product) => product.title),
    ).toEqual(["Linen Camp Shirt", "Alpine Tote"]);
    expect(
      await provider.getCollectionProducts({ collection: "samples" }),
    ).toEqual([]);
  });
});

describe("errors", () => {
  it("wraps API failures without leaking the API key", async () => {
    const { fetchImpl } = makeFetch(() => ({
      status: 401,
      body: { type: "AUTHORIZATION", message: "Unauthorized" },
    }));

    const error = await makeProvider(fetchImpl)
      .getProducts()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CommerceApiError);
    const apiError = error as CommerceApiError;
    expect(apiError.provider).toBe("squarespace");
    expect(apiError.status).toBe(401);
    expect(apiError.message).toContain("Unauthorized");
    expect(apiError.message).not.toContain(API_KEY);
  });

  it("reports malformed JSON as an API error", async () => {
    const { fetchImpl } = makeFetch(() => ({ text: "<html>nope</html>" }));
    await expect(makeProvider(fetchImpl).getProducts()).rejects.toBeInstanceOf(
      CommerceApiError,
    );
  });
});

describe("squarespaceProviderFromEnv", () => {
  it("names the missing variable instead of sending an unauthenticated request", () => {
    expect(() => squarespaceProviderFromEnv({})).toThrow(CommerceConfigError);
    expect(() => squarespaceProviderFromEnv({})).toThrow(
      /Missing required configuration: SQUARESPACE_API_TOKEN/,
    );
    expect(() => squarespaceProviderFromEnv({ SQUARESPACE_API_TOKEN: "" })).toThrow(
      CommerceConfigError,
    );
  });

  it("builds a provider from the documented variables", () => {
    const provider = squarespaceProviderFromEnv({
      SQUARESPACE_API_TOKEN: API_KEY,
      SQUARESPACE_STORE_DOMAIN: "shop.example.com",
    });
    expect(provider.id).toBe("squarespace");
    expect(() => assertProviderShape(provider)).not.toThrow();
  });
});
