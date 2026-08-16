import type { Money } from "@corte-so/commerce-core";
import type {
  AgentCollection,
  AgentOrderSummary,
  AgentProductDetail,
  AgentProductSummary,
} from "@corte-so/commerce-agent-tools";
import type {
  AdminCollection,
  AdminImage,
  AdminMoneyV2,
  AdminOrder,
  AdminProductDetail,
  AdminProductSummary,
} from "./types.js";

function reshapeMoney(money: AdminMoneyV2): Money {
  return { amount: money.amount, currencyCode: money.currencyCode };
}

/** Same alt-text fallback the storefront mapper uses, so a product reads the
 * same whichever half of the package fetched it. */
function altTextFor(image: AdminImage, productTitle: string): string {
  if (image.altText) return image.altText;
  const filename = image.url.match(/.*\/(.*)\..*/)?.[1];
  return filename ? `${productTitle} - ${filename}` : productTitle;
}

/**
 * The Admin API has no storefront-facing `availableForSale`: a product is
 * buyable when the merchant has published it, so `ACTIVE` is the signal.
 * `DRAFT` and `ARCHIVED` products are not on sale.
 */
function isAvailable(status: string): boolean {
  return status === "ACTIVE";
}

export function reshapeAgentProductSummary(
  product: AdminProductSummary,
  storeUrl: string,
): AgentProductSummary {
  const featuredImageUrl = product.featuredMedia?.preview?.image?.url;

  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    availableForSale: isAvailable(product.status),
    priceRange: {
      minVariantPrice: reshapeMoney(product.priceRangeV2.minVariantPrice),
      maxVariantPrice: reshapeMoney(product.priceRangeV2.maxVariantPrice),
    },
    tags: product.tags ?? [],
    updatedAt: product.updatedAt,
    ...(featuredImageUrl ? { featuredImageUrl } : {}),
    externalUrl: `${storeUrl}/products/${product.handle}`,
  };
}

export function reshapeAgentProductDetail(
  product: AdminProductDetail,
  storeUrl: string,
): AgentProductDetail {
  // Admin's `ProductVariant.price` is a bare decimal in the shop's currency;
  // the price range is the only place the currency code appears.
  const currencyCode = product.priceRangeV2.minVariantPrice.currencyCode;

  return {
    ...reshapeAgentProductSummary(product, storeUrl),
    description: product.description ?? "",
    options: (product.options ?? []).map((option) => ({
      name: option.name,
      values: option.values ?? [],
    })),
    variants: (product.variants?.nodes ?? []).map((variant) => ({
      id: variant.id,
      title: variant.title,
      price: { amount: variant.price, currencyCode },
      availableForSale: variant.availableForSale,
    })),
    images: (product.media?.nodes ?? [])
      .map((node) => node.image)
      .filter((image): image is AdminImage => Boolean(image))
      .map((image) => ({
        url: image.url,
        altText: altTextFor(image, product.title),
      })),
    seo: {
      title: product.seo?.title ?? product.title,
      description: product.seo?.description ?? (product.description ?? ""),
    },
  };
}

export function reshapeAgentCollection(
  collection: AdminCollection,
): AgentCollection {
  const count = collection.productsCount?.count;

  return {
    handle: collection.handle,
    title: collection.title,
    description: collection.description ?? "",
    // Matches the storefront provider's collection routing convention.
    path: `/search/${collection.handle}`,
    ...(typeof count === "number" ? { productCount: count } : {}),
  };
}

/** "PARTIALLY_REFUNDED" → "Partially refunded". */
function humanizeStatus(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const words = value.toLowerCase().split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * One readable line out of Shopify's two status enums, e.g.
 * "Paid · Unfulfilled". Cancellation outranks both — a cancelled order's
 * payment state is not what anyone is asking about.
 */
export function reshapeOrderStatus(order: AdminOrder): string {
  if (order.cancelledAt) return "Canceled";

  const parts = [
    humanizeStatus(order.displayFinancialStatus),
    humanizeStatus(order.displayFulfillmentStatus),
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" · ") : "Unknown";
}

/** How many line items get named before the summary says "+N more". */
const LINE_SUMMARY_ITEMS = 3;

export function reshapeAgentOrder(order: AdminOrder): AgentOrderSummary {
  const lines = order.lineItems?.nodes ?? [];
  const named = lines
    .slice(0, LINE_SUMMARY_ITEMS)
    .map((line) => `${line.quantity}× ${line.title}`)
    .join(", ");
  const remaining = Math.max(lines.length - LINE_SUMMARY_ITEMS, 0);
  const lineSummary =
    named === "" ? undefined : remaining > 0 ? `${named}, +${remaining} more` : named;

  const name = order.customer?.displayName ?? undefined;
  const email = order.customer?.email ?? undefined;
  const customer = name || email ? { ...(name ? { name } : {}), ...(email ? { email } : {}) } : undefined;

  return {
    id: order.id,
    ...(order.name ? { number: order.name } : {}),
    status: reshapeOrderStatus(order),
    createdAt: order.createdAt,
    total: reshapeMoney(order.totalPriceSet.shopMoney),
    ...(customer ? { customer } : {}),
    // Distinct lines, not units — and only as many as the document asked for.
    lineCount: lines.length,
    ...(lineSummary ? { lineSummary } : {}),
  };
}
