import { describe, expect, it } from "vitest";

import {
  emptyCart,
  encodeMerchandiseId,
  findCategoryId,
  parseMerchandiseId,
  slugFromPath,
  slugFromUrl,
  toCart,
  toCategorySort,
  toCollection,
  toFooterMenu,
  toHeaderMenu,
  toMoney,
  toPage,
  toProduct,
  toProducts,
  toSearchSort,
  defaultSort,
  sorting,
} from "./mappers.js";
import type {
  BigCommerceCart,
  BigCommerceCategory,
  BigCommerceCategoryTreeItem,
  BigCommerceCheckout,
  BigCommercePage,
  BigCommerceProduct,
} from "./types.js";

// Fixtures are shaped exactly like the responses the documents in queries/
// and mutations/ ask for.

const productFixture: BigCommerceProduct = {
  entityId: 111,
  sku: "SHIRT-BLUE",
  name: "Blue Shirt",
  brand: { name: "Acme" },
  plainTextDescription: "A blue shirt.",
  description: "<p>A blue shirt.</p>",
  availabilityV2: { status: "Available", description: "In stock" },
  defaultImage: { url: "https://cdn.example.com/blue.jpg", altText: "Blue" },
  images: {
    edges: [
      { node: { url: "https://cdn.example.com/blue.jpg", altText: "Blue" } },
      { node: { url: "https://cdn.example.com/blue-back.jpg", altText: "" } },
    ],
  },
  seo: {
    pageTitle: "Blue Shirt",
    metaDescription: "Buy the blue shirt.",
    metaKeywords: "shirts, blue",
  },
  path: "/blue-shirt/",
  prices: {
    price: { value: 25, currencyCode: "USD" },
    priceRange: {
      min: { value: 25, currencyCode: "USD" },
      max: { value: 30.5, currencyCode: "USD" },
    },
  },
  createdAt: { utc: "2026-01-05T00:00:00Z" },
  variants: {
    edges: [
      {
        node: {
          entityId: 222,
          sku: "SHIRT-BLUE-S",
          isPurchasable: true,
          prices: {
            price: { value: 25, currencyCode: "USD" },
            priceRange: null,
          },
          options: {
            edges: [
              {
                node: {
                  entityId: 3,
                  displayName: "Size",
                  values: { edges: [{ node: { entityId: 4, label: "Small" } }] },
                },
              },
            ],
          },
        },
      },
      {
        node: {
          entityId: 223,
          sku: "SHIRT-BLUE-L",
          isPurchasable: false,
          prices: {
            price: { value: 30.5, currencyCode: "USD" },
            priceRange: null,
          },
          options: {
            edges: [
              {
                node: {
                  entityId: 3,
                  displayName: "Size",
                  values: { edges: [{ node: { entityId: 5, label: "Large" } }] },
                },
              },
            ],
          },
        },
      },
    ],
  },
  productOptions: {
    edges: [
      {
        node: {
          __typename: "MultipleChoiceOption",
          entityId: 3,
          displayName: "Size",
          isRequired: true,
          displayStyle: "Swatch",
          values: {
            edges: [
              { node: { entityId: 4, label: "Small", isDefault: true } },
              { node: { entityId: 5, label: "Large" } },
            ],
          },
        },
      },
    ],
  },
};

const hiddenProductFixture: BigCommerceProduct = {
  ...productFixture,
  entityId: 112,
  name: "Prototype Shirt",
  path: "/prototype-shirt/",
  seo: {
    pageTitle: "Prototype Shirt",
    metaDescription: "",
    metaKeywords: "shirts, corte-frontend-hidden",
  },
};

/** No variant rows, no price range, no images — the sparse end of a catalog. */
const bareProductFixture: BigCommerceProduct = {
  entityId: 113,
  sku: "STICKER",
  name: "Sticker",
  brand: null,
  plainTextDescription: null,
  description: null,
  availabilityV2: { status: "Unavailable", description: "Out of stock" },
  defaultImage: null,
  images: null,
  seo: null,
  path: "/sticker/",
  prices: { price: { value: 2, currencyCode: "USD" }, priceRange: null },
  createdAt: null,
  variants: null,
  productOptions: null,
};

const categoryFixture: BigCommerceCategory = {
  entityId: 21,
  name: "Shirts",
  path: "/shirts/",
  description: "<p>All shirts.</p>",
  seo: {
    pageTitle: "Shirts",
    metaDescription: "Every shirt we sell.",
    metaKeywords: "",
  },
};

const categoryTreeFixture: BigCommerceCategoryTreeItem[] = [
  {
    entityId: 21,
    name: "Shirts",
    path: "/shirts/",
    hasChildren: true,
    children: [
      {
        entityId: 22,
        name: "Long sleeve",
        path: "/shirts/long-sleeve/",
        hasChildren: false,
        children: [],
      },
    ],
  },
  {
    entityId: 30,
    name: "Shoes",
    path: "/shoes/",
    hasChildren: false,
    children: [],
  },
];

const pageFixture: BigCommercePage = {
  __typename: "NormalPage",
  entityId: 41,
  name: "About us",
  isVisibleInNavigation: true,
  seo: {
    pageTitle: "About us",
    metaDescription: "Who we are.",
    metaKeywords: "",
  },
  path: "/about-us/",
  plainTextSummary: "Who we are.",
  htmlBody: "<p>Who we are.</p>",
};

const cartFixture: BigCommerceCart = {
  entityId: "cart-abc",
  currencyCode: "USD",
  isTaxIncluded: false,
  amount: { value: 50, currencyCode: "USD" },
  lineItems: {
    totalQuantity: 3,
    physicalItems: [
      {
        entityId: "line-1",
        parentEntityId: null,
        productEntityId: 111,
        variantEntityId: 222,
        sku: "SHIRT-BLUE-S",
        name: "Blue Shirt",
        url: "https://store.example.com/blue-shirt/",
        imageUrl: "https://cdn.example.com/blue.jpg",
        brand: "Acme",
        quantity: 2,
        listPrice: { value: 25, currencyCode: "USD" },
        extendedListPrice: { value: 50, currencyCode: "USD" },
        extendedSalePrice: { value: 45, currencyCode: "USD" },
        selectedOptions: [{ entityId: 3, name: "Size", value: "Small" }],
      },
    ],
    digitalItems: [],
    customItems: [
      {
        entityId: "line-2",
        sku: "GIFT-NOTE",
        name: "Gift note",
        quantity: 1,
        listPrice: { value: 5, currencyCode: "USD" },
        extendedListPrice: { value: 5, currencyCode: "USD" },
      },
    ],
  },
};

const checkoutFixture: BigCommerceCheckout = {
  subtotal: { value: 50, currencyCode: "USD" },
  taxTotal: { value: 4.25, currencyCode: "USD" },
  grandTotal: { value: 54.25, currencyCode: "USD" },
};

describe("toMoney", () => {
  it("turns numeric amounts into two-decimal strings", () => {
    expect(toMoney({ value: 25, currencyCode: "USD" })).toEqual({
      amount: "25.00",
      currencyCode: "USD",
    });
    expect(toMoney({ value: 30.5, currencyCode: "GBP" })).toEqual({
      amount: "30.50",
      currencyCode: "GBP",
    });
    expect(toMoney({ value: 0, currencyCode: "EUR" })).toEqual({
      amount: "0.00",
      currencyCode: "EUR",
    });
  });

  it("falls back to zero and the cart currency when the amount is missing", () => {
    expect(toMoney(null, "USD")).toEqual({
      amount: "0.00",
      currencyCode: "USD",
    });
  });
});

describe("slug helpers", () => {
  it("strips surrounding slashes and keeps nested segments", () => {
    expect(slugFromPath("/blue-shirt/")).toBe("blue-shirt");
    expect(slugFromPath("/shirts/long-sleeve/")).toBe("shirts/long-sleeve");
    expect(slugFromPath(null)).toBe("");
  });

  it("reads a handle out of an absolute line-item URL", () => {
    expect(slugFromUrl("https://store.example.com/blue-shirt/")).toBe(
      "blue-shirt",
    );
    expect(slugFromUrl(null)).toBe("");
  });
});

describe("merchandise ids", () => {
  it("round-trips a product/variant pair", () => {
    expect(encodeMerchandiseId(111, 222)).toBe("111:222");
    expect(parseMerchandiseId("111:222")).toEqual({
      productEntityId: 111,
      variantEntityId: 222,
    });
  });

  it("treats a bare id as a product with no variant", () => {
    expect(encodeMerchandiseId(111, null)).toBe("111");
    expect(parseMerchandiseId("111")).toEqual({ productEntityId: 111 });
  });

  it("rejects an id with no product in it", () => {
    expect(() => parseMerchandiseId("gid://shopify/ProductVariant/1")).toThrow(
      /Unusable merchandise id/,
    );
  });
});

describe("toProduct", () => {
  const product = toProduct(productFixture);

  it("maps identity and copy", () => {
    expect(product.id).toBe("111");
    expect(product.handle).toBe("blue-shirt");
    expect(product.title).toBe("Blue Shirt");
    expect(product.description).toBe("A blue shirt.");
    expect(product.descriptionHtml).toBe("<p>A blue shirt.</p>");
    expect(product.availableForSale).toBe(true);
    expect(product.seo).toEqual({
      title: "Blue Shirt",
      description: "Buy the blue shirt.",
    });
  });

  it("emits decimal-string money for the price range", () => {
    expect(product.priceRange).toEqual({
      minVariantPrice: { amount: "25.00", currencyCode: "USD" },
      maxVariantPrice: { amount: "30.50", currencyCode: "USD" },
    });
  });

  it("maps images with the requested render size", () => {
    expect(product.featuredImage).toEqual({
      url: "https://cdn.example.com/blue.jpg",
      altText: "Blue",
      width: 1080,
      height: 1080,
    });
    expect(product.images).toHaveLength(2);
    // Empty alt text falls back to the product name.
    expect(product.images[1]?.altText).toBe("Blue Shirt");
  });

  it("maps options and variants, synthesising variant titles", () => {
    expect(product.options).toEqual([
      { id: "3", name: "Size", values: ["Small", "Large"] },
    ]);
    expect(product.variants).toEqual([
      {
        id: "111:222",
        title: "Small",
        availableForSale: true,
        selectedOptions: [{ name: "Size", value: "Small" }],
        price: { amount: "25.00", currencyCode: "USD" },
      },
      {
        id: "111:223",
        title: "Large",
        availableForSale: false,
        selectedOptions: [{ name: "Size", value: "Large" }],
        price: { amount: "30.50", currencyCode: "USD" },
      },
    ]);
  });

  it("splits SEO keywords into tags and reports creation time as updatedAt", () => {
    expect(product.tags).toEqual(["shirts", "blue"]);
    expect(product.updatedAt).toBe("2026-01-05T00:00:00Z");
  });

  it("omits externalUrl unless a storefront URL is configured", () => {
    expect(product.externalUrl).toBeUndefined();
    expect(
      toProduct(productFixture, {
        storefrontUrl: "https://store.example.com/",
      }).externalUrl,
    ).toBe("https://store.example.com/blue-shirt");
  });

  it("synthesises a default variant for a product with no variant rows", () => {
    const bare = toProduct(bareProductFixture);

    expect(bare.availableForSale).toBe(false);
    expect(bare.variants).toEqual([
      {
        id: "113",
        title: "Default Title",
        availableForSale: false,
        selectedOptions: [],
        price: { amount: "2.00", currencyCode: "USD" },
      },
    ]);
    expect(bare.priceRange.minVariantPrice.amount).toBe("2.00");
    expect(bare.featuredImage).toBeUndefined();
    expect(bare.images).toEqual([]);
    expect(bare.tags).toEqual([]);
    expect(bare.seo).toEqual({ title: "Sticker", description: "" });
  });
});

describe("toProducts", () => {
  it("drops nulls and products tagged as hidden", () => {
    const products = toProducts([
      productFixture,
      hiddenProductFixture,
      null,
      undefined,
      bareProductFixture,
    ]);

    expect(products.map((product) => product.id)).toEqual(["111", "113"]);
  });
});

describe("toCollection", () => {
  it("maps a category onto a search path", () => {
    const collection = toCollection(categoryFixture);

    expect(collection.handle).toBe("shirts");
    expect(collection.title).toBe("Shirts");
    expect(collection.path).toBe("/search/shirts");
    expect(collection.seo).toEqual({
      title: "Shirts",
      description: "Every shirt we sell.",
    });
    expect(Date.parse(collection.updatedAt)).not.toBeNaN();
  });
});

describe("findCategoryId", () => {
  it("matches a top-level slug", () => {
    expect(findCategoryId(categoryTreeFixture, "shirts")).toBe(21);
  });

  it("matches a nested slug by its full path", () => {
    expect(findCategoryId(categoryTreeFixture, "shirts/long-sleeve")).toBe(22);
  });

  it("returns undefined for an unknown slug", () => {
    expect(findCategoryId(categoryTreeFixture, "hats")).toBeUndefined();
  });
});

describe("toCart", () => {
  const cart = toCart(cartFixture, {
    checkout: checkoutFixture,
    checkoutUrl: "https://store.example.com/checkout",
  });

  it("takes totals from the checkout that shares the cart id", () => {
    expect(cart.id).toBe("cart-abc");
    expect(cart.checkoutUrl).toBe("https://store.example.com/checkout");
    expect(cart.totalQuantity).toBe(3);
    expect(cart.cost).toEqual({
      subtotalAmount: { amount: "50.00", currencyCode: "USD" },
      totalAmount: { amount: "54.25", currencyCode: "USD" },
      totalTaxAmount: { amount: "4.25", currencyCode: "USD" },
    });
  });

  it("maps a catalog line to a composite merchandise id and sale total", () => {
    const [line] = cart.lines;

    expect(line?.id).toBe("line-1");
    expect(line?.quantity).toBe(2);
    // Sale price wins over list price.
    expect(line?.cost.totalAmount).toEqual({
      amount: "45.00",
      currencyCode: "USD",
    });
    expect(line?.merchandise.id).toBe("111:222");
    expect(line?.merchandise.title).toBe("Small");
    expect(line?.merchandise.product).toEqual({
      id: "111",
      handle: "blue-shirt",
      title: "Blue Shirt",
      featuredImage: {
        url: "https://cdn.example.com/blue.jpg",
        altText: "Blue Shirt",
        width: 1080,
        height: 1080,
      },
    });
  });

  it("maps a custom line, which has no catalog product behind it", () => {
    const custom = cart.lines[1];

    expect(custom?.id).toBe("line-2");
    expect(custom?.merchandise.id).toBe("line-2");
    expect(custom?.merchandise.product).toEqual({
      id: "",
      handle: "",
      title: "Gift note",
    });
  });

  it("falls back to the cart amount when there is no checkout yet", () => {
    const withoutCheckout = toCart(cartFixture, { checkout: null });

    expect(withoutCheckout.checkoutUrl).toBe("");
    expect(withoutCheckout.cost).toEqual({
      subtotalAmount: { amount: "50.00", currencyCode: "USD" },
      totalAmount: { amount: "50.00", currencyCode: "USD" },
      totalTaxAmount: { amount: "0.00", currencyCode: "USD" },
    });
  });

  it("describes an absent cart with zeroed money", () => {
    expect(emptyCart()).toEqual({
      id: "",
      checkoutUrl: "",
      cost: {
        subtotalAmount: { amount: "0.00", currencyCode: "" },
        totalAmount: { amount: "0.00", currencyCode: "" },
        totalTaxAmount: { amount: "0.00", currencyCode: "" },
      },
      totalQuantity: 0,
      lines: [],
    });
  });
});

describe("content mappers", () => {
  it("maps a web page", () => {
    expect(toPage(pageFixture)).toEqual({
      id: "41",
      title: "About us",
      handle: "about-us",
      body: "<p>Who we are.</p>",
      bodySummary: "Who we are.",
      seo: { title: "About us", description: "Who we are." },
      createdAt: "",
      updatedAt: "",
    });
  });

  it("builds the header menu from top-level categories", () => {
    expect(toHeaderMenu(categoryTreeFixture)).toEqual([
      { title: "Shirts", path: "/search/shirts" },
      { title: "Shoes", path: "/search/shoes" },
    ]);
  });

  it("builds the footer menu from navigable pages, skipping the blog index", () => {
    const blogIndex: BigCommercePage = {
      __typename: "BlogIndexPage",
      entityId: 42,
      name: "Blog",
      isVisibleInNavigation: true,
      seo: null,
      path: "/blog/",
    };
    const hidden: BigCommercePage = {
      ...pageFixture,
      entityId: 43,
      name: "Internal",
      isVisibleInNavigation: false,
      path: "/internal/",
    };

    expect(toFooterMenu([pageFixture, blogIndex, hidden])).toEqual([
      { title: "About us", path: "/about-us" },
    ]);
  });
});

describe("sorting", () => {
  it("maps every neutral sort key onto a search enum", () => {
    expect(toSearchSort("relevance")).toBe("RELEVANCE");
    expect(toSearchSort("best-selling")).toBe("BEST_SELLING");
    expect(toSearchSort("created-at", true)).toBe("NEWEST");
    expect(toSearchSort("price", false)).toBe("LOWEST_PRICE");
    expect(toSearchSort("price", true)).toBe("HIGHEST_PRICE");
    expect(toSearchSort(undefined)).toBeNull();
  });

  it("swaps relevance for the category's own order", () => {
    expect(toCategorySort("relevance")).toBe("DEFAULT");
    expect(toCategorySort("price", true)).toBe("HIGHEST_PRICE");
    expect(toCategorySort(undefined)).toBeNull();
  });

  it("exposes the standard option set with relevance as the default", () => {
    expect(sorting).toContain(defaultSort);
    expect(defaultSort.slug).toBeNull();
    expect(sorting.map((option) => option.slug)).toEqual([
      null,
      "trending-desc",
      "latest-desc",
      "price-asc",
      "price-desc",
    ]);
  });
});
