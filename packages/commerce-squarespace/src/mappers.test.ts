import { describe, expect, it } from "vitest";
import {
  mapImage,
  mapProduct,
  mapVariant,
  resolveExternalUrl,
  tagToCollection,
  toMoney,
  variantPrice,
} from "./mappers.js";
import type { SquarespaceProduct } from "./types.js";

const product: SquarespaceProduct = {
  id: "5f9a1b2c3d4e5f6a7b8c9d0e",
  type: "PHYSICAL",
  name: "Linen Camp Shirt",
  description: "<p>Washed <strong>linen</strong>, boxy fit.</p>",
  url: "https://shop.example.com/store/p/linen-camp-shirt",
  urlSlug: "linen-camp-shirt",
  storePageId: "5f9a000000000000000000aa",
  isVisible: true,
  tags: ["shirts", "summer"],
  seoOptions: { title: "Linen Camp Shirt", description: "Breezy linen shirt" },
  variantAttributes: ["Size", "Color"],
  variants: [
    {
      id: "var-s-sand",
      sku: "SHIRT-S-SAND",
      attributes: { Size: "S", Color: "Sand" },
      pricing: {
        basePrice: { currency: "EUR", value: "89.00" },
        salePrice: { currency: "EUR", value: "59.00" },
        onSale: true,
      },
      stock: { quantity: 4, unlimited: false },
    },
    {
      id: "var-m-sand",
      sku: "SHIRT-M-SAND",
      attributes: { Size: "M", Color: "Sand" },
      pricing: {
        basePrice: { currency: "EUR", value: "89.00" },
        salePrice: { currency: "EUR", value: "59.00" },
        onSale: false,
      },
      stock: { quantity: 0, unlimited: false },
    },
  ],
  images: [
    {
      id: "img-1",
      altText: "Front view",
      url: "https://images.squarespace-cdn.com/content/img-1/front.jpg",
      orderIndex: 0,
      originalSize: { width: 1600, height: 2000 },
    },
    {
      id: "img-2",
      altText: null,
      url: "https://images.squarespace-cdn.com/content/img-2/back.jpg",
      orderIndex: 1,
    },
  ],
  createdOn: "2026-01-04T10:00:00.000Z",
  modifiedOn: "2026-02-11T08:30:00.000Z",
};

describe("toMoney", () => {
  it("keeps the API's decimal string and currency", () => {
    expect(toMoney({ currency: "GBP", value: "12.50" })).toEqual({
      amount: "12.50",
      currencyCode: "GBP",
    });
  });

  it("stringifies numeric values and falls back to zero USD", () => {
    expect(toMoney({ currency: "USD", value: 12.5 }).amount).toBe("12.5");
    expect(toMoney(undefined)).toEqual({ amount: "0", currencyCode: "USD" });
  });
});

describe("variantPrice", () => {
  it("uses the sale price only when the variant is on sale", () => {
    const [onSale, notOnSale] = product.variants ?? [];
    expect(variantPrice(onSale!).amount).toBe("59.00");
    expect(variantPrice(notOnSale!).amount).toBe("89.00");
  });
});

describe("mapImage", () => {
  it("maps url, alt text and original size", () => {
    expect(mapImage(product.images![0]!)).toEqual({
      url: "https://images.squarespace-cdn.com/content/img-1/front.jpg",
      altText: "Front view",
      width: 1600,
      height: 2000,
    });
  });

  it("defaults missing alt text and size", () => {
    expect(mapImage(product.images![1]!)).toEqual({
      url: "https://images.squarespace-cdn.com/content/img-2/back.jpg",
      altText: "",
      width: 0,
      height: 0,
    });
  });
});

describe("mapVariant", () => {
  it("titles a variant by its option values and reads stock", () => {
    const variant = mapVariant(product.variants![0]!, ["Size", "Color"], "EUR");
    expect(variant).toEqual({
      id: "var-s-sand",
      title: "S / Sand",
      availableForSale: true,
      selectedOptions: [
        { name: "Size", value: "S" },
        { name: "Color", value: "Sand" },
      ],
      price: { amount: "59.00", currencyCode: "EUR" },
    });
  });

  it("treats unlimited stock as available and falls back to the default title", () => {
    const variant = mapVariant(
      {
        id: "var-only",
        sku: "",
        pricing: { basePrice: { currency: "USD", value: "5.00" } },
        stock: { quantity: 0, unlimited: true },
      },
      [],
    );
    expect(variant.title).toBe("Default Title");
    expect(variant.availableForSale).toBe(true);
  });

  it("marks a sold-out limited variant unavailable", () => {
    expect(mapVariant(product.variants![1]!, ["Size", "Color"]).availableForSale).toBe(
      false,
    );
  });
});

describe("mapProduct", () => {
  const mapped = mapProduct(product);

  it("uses the product id as the handle", () => {
    expect(mapped.handle).toBe(product.id);
    expect(mapped.id).toBe(product.id);
  });

  it("derives the price range from effective variant prices in the API currency", () => {
    expect(mapped.priceRange).toEqual({
      minVariantPrice: { amount: "59.00", currencyCode: "EUR" },
      maxVariantPrice: { amount: "89.00", currencyCode: "EUR" },
    });
  });

  it("splits plain-text description from HTML", () => {
    expect(mapped.descriptionHtml).toBe(product.description);
    expect(mapped.description).toBe("Washed linen, boxy fit.");
  });

  it("dedupes option values and keeps images in order", () => {
    expect(mapped.options).toEqual([
      { id: "Size", name: "Size", values: ["S", "M"] },
      { id: "Color", name: "Color", values: ["Sand"] },
    ]);
    expect(mapped.images).toHaveLength(2);
    expect(mapped.featuredImage?.url).toBe(mapped.images[0]!.url);
  });

  it("reports modifiedOn as updatedAt and carries tags and SEO", () => {
    expect(mapped.updatedAt).toBe("2026-02-11T08:30:00.000Z");
    expect(mapped.tags).toEqual(["shirts", "summer"]);
    expect(mapped.seo).toEqual({
      title: "Linen Camp Shirt",
      description: "Breezy linen shirt",
    });
  });

  it("is unavailable when hidden or when every variant is sold out", () => {
    expect(mapped.availableForSale).toBe(true);
    expect(mapProduct({ ...product, isVisible: false }).availableForSale).toBe(false);

    const soldOut = {
      ...product,
      variants: product.variants!.map((variant) => ({
        ...variant,
        stock: { quantity: 0, unlimited: false },
      })),
    };
    expect(mapProduct(soldOut).availableForSale).toBe(false);
  });
});

describe("resolveExternalUrl", () => {
  it("prefers the absolute URL the API returns", () => {
    expect(mapProduct(product, "https://other.example.com").externalUrl).toBe(
      "https://shop.example.com/store/p/linen-camp-shirt",
    );
  });

  it("absolutizes a site-relative URL against the store domain", () => {
    expect(
      resolveExternalUrl(
        { ...product, url: "/store/p/linen-camp-shirt" },
        "https://shop.example.com",
      ),
    ).toBe("https://shop.example.com/store/p/linen-camp-shirt");
  });

  it("omits the URL when there is nothing trustworthy to build one from", () => {
    expect(resolveExternalUrl({ ...product, url: undefined })).toBeUndefined();
    expect(
      resolveExternalUrl({ ...product, url: "/store/p/x" }, undefined),
    ).toBeUndefined();
    expect(mapProduct({ ...product, url: undefined })).not.toHaveProperty(
      "externalUrl",
    );
  });
});

describe("tagToCollection", () => {
  it("builds a search path for the tag", () => {
    expect(tagToCollection("summer sale", "2026-02-11T08:30:00.000Z")).toEqual({
      handle: "summer sale",
      title: "summer sale",
      description: "summer sale",
      seo: { title: "summer sale", description: "summer sale" },
      path: "/search/summer%20sale",
      updatedAt: "2026-02-11T08:30:00.000Z",
    });
  });
});
