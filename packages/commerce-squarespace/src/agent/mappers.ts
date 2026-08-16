import type {
  AgentOrderSummary,
  AgentProductDetail,
  AgentProductSummary,
} from "@corte-so/commerce-agent-tools";
import type { Product } from "@corte-so/commerce-core";
import { toMoney } from "../mappers.js";
import type { SquarespaceOrder, SquarespaceOrderLineItem } from "./types.js";

/** Line items named in a summary before it collapses into "+N more". */
const SUMMARY_LINES = 3;

// Products reach the agent through the same `mapProduct` the storefront uses,
// so both surfaces report the same price, availability and externalUrl for a
// product; these two functions only narrow that shared `Product` to the
// chat-sized agent shapes.

export function toAgentSummary(product: Product): AgentProductSummary {
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    availableForSale: product.availableForSale,
    priceRange: product.priceRange,
    tags: product.tags,
    updatedAt: product.updatedAt,
    ...(product.featuredImage?.url
      ? { featuredImageUrl: product.featuredImage.url }
      : {}),
    ...(product.externalUrl ? { externalUrl: product.externalUrl } : {}),
  };
}

export function toAgentDetail(product: Product): AgentProductDetail {
  return {
    ...toAgentSummary(product),
    description: product.description,
    options: product.options.map((option) => ({
      name: option.name,
      values: option.values,
    })),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      title: variant.title,
      price: variant.price,
      availableForSale: variant.availableForSale,
    })),
    images: product.images.map((image) => ({
      url: image.url,
      altText: image.altText,
    })),
    seo: product.seo,
  };
}

/**
 * Squarespace reports fulfillment, not order lifecycle, so its three states
 * are reported in the same vocabulary the `list_orders` filter accepts.
 * Anything unrecognized is passed through lowercased rather than forced into a
 * bucket it may not belong in.
 */
export function toAgentOrderStatus(fulfillmentStatus?: string): string {
  switch (fulfillmentStatus) {
    case "PENDING":
      return "open";
    case "FULFILLED":
      return "completed";
    case "CANCELED":
      return "canceled";
    default:
      return fulfillmentStatus?.toLowerCase() || "unknown";
  }
}

function customerName(order: SquarespaceOrder): string | undefined {
  const address = order.billingAddress ?? order.shippingAddress;
  const name = [address?.firstName, address?.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .trim();
  return name || undefined;
}

/** "2× Linen Shirt, 1× Belt, 1× Cap +2 more" — small enough for chat. */
export function lineSummary(
  lineItems: SquarespaceOrderLineItem[],
): string | undefined {
  if (lineItems.length === 0) return undefined;

  const named = lineItems
    .slice(0, SUMMARY_LINES)
    .map((item) => `${item.quantity ?? 1}× ${item.productName?.trim() || "Item"}`)
    .join(", ");

  const remaining = lineItems.length - SUMMARY_LINES;
  return remaining > 0 ? `${named} +${remaining} more` : named;
}

export function toAgentOrder(order: SquarespaceOrder): AgentOrderSummary {
  const lineItems = order.lineItems ?? [];
  const name = customerName(order);
  const email = order.customerEmail?.trim();
  const summary = lineSummary(lineItems);

  return {
    id: order.id,
    ...(order.orderNumber ? { number: order.orderNumber } : {}),
    status: toAgentOrderStatus(order.fulfillmentStatus),
    createdAt: order.createdOn ?? order.modifiedOn ?? "",
    // Orders report money the same way products do — `{ currency, value }` in
    // major units — so the catalog's Money mapper covers both.
    total: toMoney(order.grandTotal),
    ...(name || email
      ? { customer: { ...(name ? { name } : {}), ...(email ? { email } : {}) } }
      : {}),
    lineCount: lineItems.length,
    ...(summary ? { lineSummary: summary } : {}),
  };
}
