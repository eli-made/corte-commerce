import { DEFAULT_OPTION, type Money } from "@corte-so/commerce-core";
import type {
  AgentCollection,
  AgentOrderSummary,
  AgentProductDetail,
  AgentProductSummary,
} from "@corte-so/commerce-agent-tools";

import { encodeMerchandiseId, slugFromPath } from "../mappers.js";
import type {
  BigCommerceRestCategory,
  BigCommerceRestImage,
  BigCommerceRestOrder,
  BigCommerceRestProduct,
  BigCommerceRestVariant,
} from "./types.js";

export type ProductMapOptions = {
  /** Labels catalog prices; v3 catalog resources carry no currency code. */
  currencyCode: string;
  /** Public storefront origin; without it products report no `externalUrl`. */
  storefrontUrl?: string | undefined;
};

/** v3 catalog money is a bare JSON number; agent shapes want a decimal string. */
const toAmount = (value: number | string | null | undefined): string => {
  const numeric = typeof value === "string" ? Number.parseFloat(value) : value;
  return typeof numeric === "number" && Number.isFinite(numeric)
    ? numeric.toFixed(2)
    : "0.00";
};

export const toMoney = (
  value: number | string | null | undefined,
  currencyCode: string,
): Money => ({ amount: toAmount(value), currencyCode });

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * BigCommerce descriptions are HTML. Agent results are read by a model in a
 * chat context, so markup is stripped rather than forwarded — this is a display
 * reduction, not a sanitiser.
 */
export const plainText = (html: string | null | undefined): string =>
  (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();

const imageUrl = (image: BigCommerceRestImage): string =>
  image.url_standard ?? image.url_zoom ?? image.url_thumbnail ?? "";

const productImages = (
  product: BigCommerceRestProduct,
): { url: string; altText: string }[] =>
  (product.images ?? [])
    .map((image) => ({
      url: imageUrl(image),
      altText: image.description || product.name,
    }))
    .filter((image) => image.url !== "");

const featuredImageUrl = (
  product: BigCommerceRestProduct,
): string | undefined => {
  const images = product.images ?? [];
  const thumbnail = images.find((image) => image.is_thumbnail);
  const url = imageUrl(thumbnail ?? images[0] ?? {});
  return url || undefined;
};

const variantPrice = (
  variant: BigCommerceRestVariant,
  product: BigCommerceRestProduct,
): number | undefined => {
  const value =
    variant.calculated_price ??
    variant.price ??
    product.calculated_price ??
    product.price;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
};

/**
 * Purchasability of one variant. `purchasing_disabled` is the merchant's
 * explicit switch; stock only gates it when the product tracks inventory at the
 * level being asked about.
 */
export const variantAvailable = (
  variant: BigCommerceRestVariant,
  product: BigCommerceRestProduct,
): boolean => {
  if (variant.purchasing_disabled) return false;
  if (product.inventory_tracking === "variant") {
    return (variant.inventory_level ?? 0) > 0;
  }
  if (product.inventory_tracking === "product") {
    return (product.inventory_level ?? 0) > 0;
  }
  return true;
};

/**
 * Purchasability of the product. Hidden or disabled products are never
 * available; otherwise stock decides, at whichever level the product tracks it.
 */
export const productAvailable = (product: BigCommerceRestProduct): boolean => {
  if (product.is_visible === false) return false;
  if (product.availability === "disabled") return false;
  if (product.inventory_tracking === "product") {
    return (product.inventory_level ?? 0) > 0;
  }
  if (product.inventory_tracking === "variant" && product.variants?.length) {
    return product.variants.some((variant) =>
      variantAvailable(variant, product),
    );
  }
  return true;
};

/**
 * BigCommerce has no tag primitive. `search_keywords` — the merchandising
 * keyword list — is the closest equivalent and is what this backend reads and
 * writes. Note the catalog provider in this same package reports `Product.tags`
 * from SEO meta keywords instead, because that is the only keyword field the
 * Storefront GraphQL API exposes; the two do not share a field.
 */
export const toTags = (keywords: string | null | undefined): string[] =>
  (keywords ?? "")
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);

export const tagsToSearchKeywords = (tags: string[]): string =>
  tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join(",");

const productHandle = (product: BigCommerceRestProduct): string =>
  slugFromPath(product.custom_url?.url) || String(product.id);

const externalUrl = (
  product: BigCommerceRestProduct,
  storefrontUrl: string | undefined,
): string | undefined => {
  const slug = slugFromPath(product.custom_url?.url);
  if (!storefrontUrl || !slug) return undefined;
  return `${storefrontUrl.replace(/\/+$/, "")}/${slug}`;
};

const priceRange = (
  product: BigCommerceRestProduct,
  currencyCode: string,
): AgentProductSummary["priceRange"] => {
  const prices = (product.variants ?? [])
    .map((variant) => variantPrice(variant, product))
    .filter((price): price is number => price !== undefined);

  if (prices.length === 0) {
    const fallback = product.calculated_price ?? product.price;
    return {
      minVariantPrice: toMoney(fallback, currencyCode),
      maxVariantPrice: toMoney(fallback, currencyCode),
    };
  }

  return {
    minVariantPrice: toMoney(Math.min(...prices), currencyCode),
    maxVariantPrice: toMoney(Math.max(...prices), currencyCode),
  };
};

export const toAgentProductSummary = (
  product: BigCommerceRestProduct,
  options: ProductMapOptions,
): AgentProductSummary => {
  const featured = featuredImageUrl(product);
  const external = externalUrl(product, options.storefrontUrl);

  return {
    id: String(product.id),
    handle: productHandle(product),
    title: product.name,
    availableForSale: productAvailable(product),
    priceRange: priceRange(product, options.currencyCode),
    tags: toTags(product.search_keywords),
    // v3 carries a real modification timestamp, unlike the Storefront API.
    updatedAt: product.date_modified ?? product.date_created ?? "",
    ...(featured ? { featuredImageUrl: featured } : {}),
    ...(external ? { externalUrl: external } : {}),
  };
};

/** Variants have no title in BigCommerce; it is synthesised from the selected
 * option values, exactly as the catalog provider does. */
const variantTitle = (variant: BigCommerceRestVariant): string => {
  const title = (variant.option_values ?? [])
    .map((value) => value.label)
    .filter(Boolean)
    .join(" / ");

  return title || DEFAULT_OPTION;
};

const toVariants = (
  product: BigCommerceRestProduct,
  currencyCode: string,
): AgentProductDetail["variants"] => {
  const variants = product.variants ?? [];

  if (variants.length === 0) {
    // A product with no variant rows is still addressable by product id.
    return [
      {
        id: encodeMerchandiseId(product.id),
        title: DEFAULT_OPTION,
        price: toMoney(product.calculated_price ?? product.price, currencyCode),
        availableForSale: productAvailable(product),
      },
    ];
  }

  return variants.map((variant) => ({
    // Same composite merchandise id the catalog provider hands out, so an
    // agent-reported variant can be added to a cart without translation.
    id: encodeMerchandiseId(product.id, variant.id),
    title: variantTitle(variant),
    price: toMoney(variantPrice(variant, product), currencyCode),
    availableForSale: variantAvailable(variant, product),
  }));
};

export const toAgentProductDetail = (
  product: BigCommerceRestProduct,
  options: ProductMapOptions,
): AgentProductDetail => ({
  ...toAgentProductSummary(product, options),
  description: plainText(product.description),
  options: (product.options ?? []).map((option) => ({
    name: option.display_name ?? "",
    values: (option.option_values ?? [])
      .map((value) => value.label ?? "")
      .filter(Boolean),
  })),
  variants: toVariants(product, options.currencyCode),
  images: productImages(product),
  seo: {
    title: product.page_title || product.name,
    description: product.meta_description ?? "",
  },
});

export const toAgentCollection = (
  category: BigCommerceRestCategory,
): AgentCollection => {
  const handle = slugFromPath(category.custom_url?.url) || String(category.id);

  return {
    handle,
    title: category.name,
    description: plainText(category.description),
    // Categories carry their real storefront path in v3, so it is reported
    // as-is rather than as the catalog provider's `/search/<handle>` route.
    path: `/${handle}`,
  };
};

/** v2 dates are RFC-2822; agent shapes report ISO-8601 where parsing allows. */
const toIsoDate = (date: string | undefined): string => {
  if (!date) return "";
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toISOString();
};

const orderCustomer = (
  order: BigCommerceRestOrder,
): AgentOrderSummary["customer"] => {
  const address = order.billing_address;
  const name = [address?.first_name, address?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const email = address?.email ?? "";

  if (!name && !email) return undefined;

  return {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
  };
};

export const toAgentOrderSummary = (
  order: BigCommerceRestOrder,
): AgentOrderSummary => {
  const customer = orderCustomer(order);

  return {
    // BigCommerce's order id *is* the order number the merchant sees, so no
    // separate `number` is reported.
    id: String(order.id),
    status: order.status ?? "",
    createdAt: toIsoDate(order.date_created),
    total: toMoney(order.total_inc_tax, order.currency_code ?? ""),
    ...(customer ? { customer } : {}),
    // `items_total` is a quantity total, not a distinct-line count — v2 only
    // exposes line rows through a second request per order.
    lineCount: order.items_total ?? 0,
  };
};
