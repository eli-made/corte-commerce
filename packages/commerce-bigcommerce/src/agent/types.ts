/**
 * Shapes of the BigCommerce management REST payloads this backend reads.
 * Catalog resources are v3 (`{ data, meta }` envelopes); orders are v2, which
 * returns bare arrays and RFC-2822 dates. Only the fields that are mapped are
 * declared — everything else on the wire is ignored.
 */

/** v3 responses wrap their payload; `meta` is unused here. */
export type V3Envelope<TData> = { data: TData };

export type BigCommerceRestImage = {
  id?: number;
  is_thumbnail?: boolean;
  sort_order?: number;
  description?: string | null;
  url_zoom?: string;
  url_standard?: string;
  url_thumbnail?: string;
  url_tiny?: string;
};

export type BigCommerceRestOptionValue = {
  id?: number;
  label?: string;
  option_display_name?: string;
};

export type BigCommerceRestProductOption = {
  id?: number;
  display_name?: string;
  option_values?: BigCommerceRestOptionValue[] | null;
};

export type BigCommerceRestVariant = {
  id: number;
  product_id?: number;
  sku?: string | null;
  price?: number | null;
  calculated_price?: number | null;
  sale_price?: number | null;
  inventory_level?: number | null;
  purchasing_disabled?: boolean;
  image_url?: string | null;
  option_values?: BigCommerceRestOptionValue[] | null;
};

/** `availability` is BigCommerce's storefront purchasability state. */
export type BigCommerceRestAvailability = "available" | "disabled" | "preorder";

export type BigCommerceRestProduct = {
  id: number;
  name: string;
  description?: string | null;
  sku?: string | null;
  price?: number | null;
  calculated_price?: number | null;
  is_visible?: boolean;
  availability?: BigCommerceRestAvailability | string;
  inventory_tracking?: "none" | "product" | "variant" | string;
  inventory_level?: number | null;
  date_created?: string;
  date_modified?: string;
  page_title?: string | null;
  meta_description?: string | null;
  meta_keywords?: string[] | null;
  search_keywords?: string | null;
  custom_url?: { url?: string; is_customized?: boolean } | null;
  /** Present only with `include=images`. */
  images?: BigCommerceRestImage[] | null;
  /** Present only with `include=variants`. */
  variants?: BigCommerceRestVariant[] | null;
  /** Present only with `include=options`. */
  options?: BigCommerceRestProductOption[] | null;
};

export type BigCommerceRestCategory = {
  id: number;
  parent_id?: number;
  name: string;
  description?: string | null;
  is_visible?: boolean;
  custom_url?: { url?: string } | null;
};

export type BigCommerceRestAddress = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

/**
 * v2 order. Money fields arrive as decimal *strings* ("45.0000") and
 * `date_created` is RFC-2822 ("Tue, 20 Jan 2026 12:00:00 +0000").
 */
export type BigCommerceRestOrder = {
  id: number;
  status_id?: number;
  status?: string;
  date_created?: string;
  total_inc_tax?: string | number | null;
  currency_code?: string;
  items_total?: number;
  billing_address?: BigCommerceRestAddress | null;
};
