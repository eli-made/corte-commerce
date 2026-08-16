// Wire shapes returned by the Squarespace Commerce API (api.squarespace.com,
// /1.0/commerce/products). Only the fields this provider reads are modelled;
// the API returns more and is free to add fields.

export type SquarespacePrice = {
  /** ISO 4217, e.g. "USD". */
  currency: string;
  /** Decimal string in major units, e.g. "12.50" — not cents. */
  value: string | number;
};

export type SquarespaceProductImage = {
  id: string;
  altText: string | null;
  url: string;
  orderIndex?: number;
  originalSize?: {
    width: number;
    height: number;
  };
};

export type SquarespaceProductVariant = {
  id: string;
  sku?: string;
  /** Option name → option value, e.g. { Color: "Red" }. */
  attributes?: Record<string, string>;
  pricing?: {
    basePrice?: SquarespacePrice;
    salePrice?: SquarespacePrice;
    onSale?: boolean;
  };
  stock?: {
    quantity?: number;
    unlimited?: boolean;
  };
  image?: SquarespaceProductImage | null;
};

export type SquarespaceSeoOptions = {
  title?: string;
  description?: string;
};

export type SquarespaceProduct = {
  id: string;
  type?: "PHYSICAL" | "DIGITAL" | string;
  name: string;
  description?: string;
  /** Absolute URL of the product page on the merchant's Squarespace site.
   * Occasionally a site-relative path; the mapper handles both. */
  url?: string;
  urlSlug?: string;
  storePageId?: string;
  isVisible?: boolean;
  tags?: string[];
  seoOptions?: SquarespaceSeoOptions;
  variantAttributes?: string[];
  variants?: SquarespaceProductVariant[];
  images?: SquarespaceProductImage[];
  /** ISO 8601. */
  createdOn?: string;
  /** ISO 8601. */
  modifiedOn?: string;
};

export type SquarespacePagination = {
  hasNextPage?: boolean;
  nextPageCursor?: string | null;
  nextPageUrl?: string | null;
};

export type SquarespaceProductsResponse = {
  products?: SquarespaceProduct[];
  pagination?: SquarespacePagination;
};
