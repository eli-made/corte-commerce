import type { SquarespacePagination, SquarespacePrice } from "../types.js";

// Wire shapes for the two endpoints only the agent backend calls: the Orders
// API (GET /1.0/commerce/orders) and the documented product update
// (POST /v2/commerce/products/{productId}). Only the fields read here are
// modelled; the API returns more and is free to add fields.

/** The three states `fulfillmentStatus` takes, and reports back. */
export type SquarespaceFulfillmentStatus = "PENDING" | "FULFILLED" | "CANCELED";

export type SquarespaceOrderLineItem = {
  id?: string;
  productId?: string;
  variantId?: string;
  sku?: string;
  productName?: string;
  quantity?: number;
  unitPricePaid?: SquarespacePrice;
};

export type SquarespaceOrderAddress = {
  firstName?: string;
  lastName?: string;
};

export type SquarespaceOrder = {
  id: string;
  /** Human-facing number, a string on the wire ("3"), not the id. */
  orderNumber?: string;
  /** ISO 8601. */
  createdOn?: string;
  /** ISO 8601. */
  modifiedOn?: string;
  fulfillmentStatus?: SquarespaceFulfillmentStatus | string;
  customerEmail?: string;
  billingAddress?: SquarespaceOrderAddress | null;
  shippingAddress?: SquarespaceOrderAddress | null;
  grandTotal?: SquarespacePrice;
  lineItems?: SquarespaceOrderLineItem[];
};

/** The Orders API keys its page `result`, where products use `products`. */
export type SquarespaceOrdersResponse = {
  result?: SquarespaceOrder[];
  pagination?: SquarespacePagination;
};

/**
 * The v2 update endpoint takes each field wrapped in a "Change" object, so a
 * body can distinguish "set this to X" from "leave it alone" — omitted fields
 * and `present: false` both mean untouched.
 */
export type SquarespaceChange<T> = { present: true; value: T };

export type SquarespaceProductUpdateBody = {
  name?: SquarespaceChange<string>;
  description?: SquarespaceChange<string>;
  tags?: SquarespaceChange<string[]>;
  isVisible?: SquarespaceChange<boolean>;
  seoData?: SquarespaceChange<{ title: string; description: string }>;
};
