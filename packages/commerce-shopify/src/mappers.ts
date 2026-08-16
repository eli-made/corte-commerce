import {
  HIDDEN_PRODUCT_TAG,
  type Cart,
  type CartItem,
  type Collection,
  type Image,
  type Menu,
  type Money,
  type Page,
  type Product,
  type SEO,
} from "@corte-so/commerce-core";
import type {
  Connection,
  ShopifyCart,
  ShopifyCartLine,
  ShopifyCollection,
  ShopifyImage,
  ShopifyMenuItem,
  ShopifyMoney,
  ShopifyPage,
  ShopifyProduct,
  ShopifySEO,
} from "./types.js";

export function removeEdgesAndNodes<T>(connection: Connection<T> | null | undefined): T[] {
  return (connection?.edges ?? []).map((edge) => edge?.node).filter(Boolean) as T[];
}

/** Storefront SEO fields are nullable; fall back to the resource's own copy so
 * consumers never have to null-check `seo`. */
function reshapeSEO(seo: ShopifySEO | null | undefined, fallback: SEO): SEO {
  return {
    title: seo?.title ?? fallback.title,
    description: seo?.description ?? fallback.description,
  };
}

function reshapeMoney(money: ShopifyMoney): Money {
  return { amount: money.amount, currencyCode: money.currencyCode };
}

/** Upstream's alt-text fallback: derive a label from the image filename when
 * the merchant left `altText` empty. */
function altTextFor(image: ShopifyImage, productTitle: string): string {
  if (image.altText) return image.altText;
  const filename = image.url.match(/.*\/(.*)\..*/)?.[1];
  return filename ? `${productTitle} - ${filename}` : productTitle;
}

function reshapeImage(image: ShopifyImage, productTitle: string): Image {
  return {
    url: image.url,
    altText: altTextFor(image, productTitle),
    width: image.width ?? 0,
    height: image.height ?? 0,
  };
}

export function reshapeProduct(
  product: ShopifyProduct | null | undefined,
  options: { storeUrl: string; filterHidden?: boolean },
): Product | undefined {
  if (!product) return undefined;

  const filterHidden = options.filterHidden ?? true;
  if (filterHidden && product.tags?.includes(HIDDEN_PRODUCT_TAG)) {
    return undefined;
  }

  return {
    id: product.id,
    handle: product.handle,
    availableForSale: product.availableForSale,
    title: product.title,
    description: product.description,
    descriptionHtml: product.descriptionHtml,
    options: product.options ?? [],
    priceRange: {
      maxVariantPrice: reshapeMoney(product.priceRange.maxVariantPrice),
      minVariantPrice: reshapeMoney(product.priceRange.minVariantPrice),
    },
    featuredImage: product.featuredImage
      ? reshapeImage(product.featuredImage, product.title)
      : undefined,
    seo: reshapeSEO(product.seo, {
      title: product.title,
      description: product.description,
    }),
    tags: product.tags ?? [],
    updatedAt: product.updatedAt,
    variants: removeEdgesAndNodes(product.variants).map((variant) => ({
      id: variant.id,
      title: variant.title,
      availableForSale: variant.availableForSale,
      selectedOptions: variant.selectedOptions ?? [],
      price: reshapeMoney(variant.price),
    })),
    images: removeEdgesAndNodes(product.images).map((image) =>
      reshapeImage(image, product.title),
    ),
    externalUrl: `${options.storeUrl}/products/${product.handle}`,
  };
}

export function reshapeProducts(
  products: Array<ShopifyProduct | null | undefined>,
  options: { storeUrl: string },
): Product[] {
  const reshaped: Product[] = [];
  for (const product of products) {
    const next = reshapeProduct(product, options);
    if (next) reshaped.push(next);
  }
  return reshaped;
}

export function reshapeCollection(
  collection: ShopifyCollection | null | undefined,
): Collection | undefined {
  if (!collection) return undefined;

  return {
    handle: collection.handle,
    title: collection.title,
    description: collection.description,
    seo: reshapeSEO(collection.seo, {
      title: collection.title,
      description: collection.description,
    }),
    updatedAt: collection.updatedAt,
    path: `/search/${collection.handle}`,
  };
}

export function reshapeCollections(
  collections: Array<ShopifyCollection | null | undefined>,
): Collection[] {
  const reshaped: Collection[] = [];
  for (const collection of collections) {
    const next = reshapeCollection(collection);
    if (next) reshaped.push(next);
  }
  return reshaped;
}

function reshapeCartLine(line: ShopifyCartLine): CartItem {
  const product = line.merchandise.product;
  return {
    id: line.id,
    quantity: line.quantity,
    cost: { totalAmount: reshapeMoney(line.cost.totalAmount) },
    merchandise: {
      id: line.merchandise.id,
      title: line.merchandise.title,
      selectedOptions: line.merchandise.selectedOptions ?? [],
      product: {
        id: product.id,
        handle: product.handle,
        title: product.title,
        featuredImage: product.featuredImage
          ? reshapeImage(product.featuredImage, product.title)
          : undefined,
      },
    },
  };
}

export function reshapeCart(cart: ShopifyCart): Cart {
  const { subtotalAmount, totalAmount, totalTaxAmount } = cart.cost;

  return {
    id: cart.id,
    checkoutUrl: cart.checkoutUrl,
    cost: {
      subtotalAmount: reshapeMoney(subtotalAmount),
      totalAmount: reshapeMoney(totalAmount),
      // Shopify omits tax until it knows a destination. Zero it out in the
      // cart's own currency rather than inventing one.
      totalTaxAmount: totalTaxAmount
        ? reshapeMoney(totalTaxAmount)
        : {
            amount: "0.0",
            currencyCode:
              subtotalAmount?.currencyCode ?? totalAmount?.currencyCode ?? "USD",
          },
    },
    totalQuantity: cart.totalQuantity,
    lines: removeEdgesAndNodes(cart.lines).map(reshapeCartLine),
  };
}

export function reshapePage(page: ShopifyPage | null | undefined): Page | null {
  if (!page) return null;

  return {
    id: page.id,
    title: page.title,
    handle: page.handle,
    body: page.body,
    bodySummary: page.bodySummary,
    seo: reshapeSEO(page.seo, {
      title: page.title,
      description: page.bodySummary,
    }),
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
}

/**
 * Menu item URLs are absolute store URLs. Rewrite them into storefront-local
 * paths matching this contract's routing convention (`/search/<collection>`).
 */
export function reshapeMenuItem(item: ShopifyMenuItem, storeUrl: string): Menu {
  return {
    title: item.title,
    path: item.url
      .replace(storeUrl, "")
      .replace("/collections", "/search")
      .replace("/pages", ""),
  };
}
