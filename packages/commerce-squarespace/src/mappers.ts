import { DEFAULT_OPTION } from "@corte-so/commerce-core";
import type {
  Collection,
  Image,
  Money,
  Product,
  ProductOption,
  ProductVariant,
} from "@corte-so/commerce-core";
import type {
  SquarespacePrice,
  SquarespaceProduct,
  SquarespaceProductImage,
  SquarespaceProductVariant,
} from "./types.js";

const FALLBACK_CURRENCY = "USD";

/**
 * The Commerce API reports money as `{ currency, value }` where `value` is
 * already a decimal string in major units ("12.50"), so `Money` needs no cent
 * conversion — only normalization and the API's own currency code, never a
 * hardcoded one.
 */
export function toMoney(
  price: SquarespacePrice | undefined,
  fallbackCurrency = FALLBACK_CURRENCY,
): Money {
  const raw = price?.value;
  const amount =
    typeof raw === "number"
      ? String(raw)
      : typeof raw === "string" && raw.trim() !== ""
        ? raw.trim()
        : "0";
  return {
    amount,
    currencyCode: price?.currency || fallbackCurrency,
  };
}

function moneyAsNumber(money: Money): number {
  const parsed = Number.parseFloat(money.amount);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Sale price when the variant is on sale, base price otherwise. */
export function variantPrice(
  variant: SquarespaceProductVariant,
  fallbackCurrency = FALLBACK_CURRENCY,
): Money {
  const pricing = variant.pricing;
  if (pricing?.onSale && pricing.salePrice) {
    return toMoney(pricing.salePrice, fallbackCurrency);
  }
  return toMoney(pricing?.basePrice, fallbackCurrency);
}

export function mapImage(image: SquarespaceProductImage): Image {
  return {
    url: image.url,
    altText: image.altText ?? "",
    width: image.originalSize?.width ?? 0,
    height: image.originalSize?.height ?? 0,
  };
}

export function mapVariant(
  variant: SquarespaceProductVariant,
  optionNames: string[],
  fallbackCurrency = FALLBACK_CURRENCY,
): ProductVariant {
  const attributes = variant.attributes ?? {};
  const selectedOptions = optionNames
    .filter((name) => attributes[name] !== undefined)
    .map((name) => ({ name, value: attributes[name] as string }));

  const title =
    selectedOptions.map((option) => option.value).join(" / ") ||
    variant.sku ||
    DEFAULT_OPTION;

  const stock = variant.stock;

  return {
    id: variant.id,
    title,
    availableForSale: stock?.unlimited === true || (stock?.quantity ?? 0) > 0,
    selectedOptions,
    price: variantPrice(variant, fallbackCurrency),
  };
}

function mapOptions(product: SquarespaceProduct): ProductOption[] {
  const variants = product.variants ?? [];
  return (product.variantAttributes ?? []).map((name) => {
    const values: string[] = [];
    for (const variant of variants) {
      const value = variant.attributes?.[name];
      if (value && !values.includes(value)) values.push(value);
    }
    return { id: name, name, values };
  });
}

function stripHtml(html: string): string {
  return html
    // Block boundaries become spaces; inline tags vanish so punctuation stays put.
    .replace(/<\s*(br|hr|\/p|\/div|\/li|\/tr|\/h[1-6]|\/blockquote)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Absolute URL of the product on the merchant's own storefront, used by
 * templates for the "View on store" affordance. The API's `url` is normally
 * absolute; when it is a site-relative path it is resolved against the
 * configured store domain. Nothing is synthesized from `urlSlug` alone —
 * Squarespace product paths include the store page's path, which the products
 * endpoint does not report, so a guess would produce dead links.
 */
export function resolveExternalUrl(
  product: SquarespaceProduct,
  storeOrigin?: string,
): string | undefined {
  const url = product.url?.trim();
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (!storeOrigin) return undefined;
  return `${storeOrigin}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * Squarespace products have no storefront handle of their own — `urlSlug` is
 * unique only within a store page — so the provider uses the product id as the
 * `handle`. Routes built from `Product.handle` therefore carry ids, and
 * `getProduct(handle)` looks products up by id.
 */
export function mapProduct(
  product: SquarespaceProduct,
  storeOrigin?: string,
): Product {
  const variants = product.variants ?? [];
  const images = (product.images ?? []).map(mapImage);
  const optionNames = product.variantAttributes ?? [];

  const currency =
    variants.find((variant) => variant.pricing?.basePrice?.currency)?.pricing
      ?.basePrice?.currency ?? FALLBACK_CURRENCY;

  const mappedVariants = variants.map((variant) =>
    mapVariant(variant, optionNames, currency),
  );

  const prices = mappedVariants.map((variant) => variant.price);
  const zero: Money = { amount: "0", currencyCode: currency };
  const minVariantPrice = prices.reduce(
    (min, price) => (moneyAsNumber(price) < moneyAsNumber(min) ? price : min),
    prices[0] ?? zero,
  );
  const maxVariantPrice = prices.reduce(
    (max, price) => (moneyAsNumber(price) > moneyAsNumber(max) ? price : max),
    prices[0] ?? zero,
  );

  const descriptionHtml = product.description ?? "";
  const description = stripHtml(descriptionHtml);
  const externalUrl = resolveExternalUrl(product, storeOrigin);

  return {
    id: product.id,
    handle: product.id,
    availableForSale:
      product.isVisible !== false &&
      (mappedVariants.length === 0 ||
        mappedVariants.some((variant) => variant.availableForSale)),
    title: product.name,
    description,
    descriptionHtml,
    options: mapOptions(product),
    priceRange: { minVariantPrice, maxVariantPrice },
    ...(images[0] ? { featuredImage: images[0] } : {}),
    seo: {
      title: product.seoOptions?.title || product.name,
      description: product.seoOptions?.description || description,
    },
    tags: product.tags ?? [],
    updatedAt: product.modifiedOn ?? product.createdOn ?? "",
    variants: mappedVariants,
    images,
    ...(externalUrl ? { externalUrl } : {}),
  };
}

/**
 * Squarespace has no storefront collection resource on the Commerce API, so
 * product tags stand in for collections: every tag becomes a pseudo-collection
 * whose products are the ones carrying that tag.
 */
export function tagToCollection(tag: string, updatedAt: string): Collection {
  return {
    handle: tag,
    title: tag,
    description: tag,
    seo: { title: tag, description: tag },
    path: `/search/${encodeURIComponent(tag)}`,
    updatedAt,
  };
}
