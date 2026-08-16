// Provider-neutral commerce domain model. Providers map their native API
// shapes onto these types in their own mapper layer; nothing here may
// reference a specific provider's concepts.

export type Money = {
  /** Decimal string, e.g. "12.50". Never cents. */
  amount: string;
  /** ISO 4217, e.g. "USD". */
  currencyCode: string;
};

export type Image = {
  url: string;
  altText: string;
  width: number;
  height: number;
};

export type SEO = {
  title: string;
  description: string;
};

export type ProductOption = {
  id: string;
  name: string;
  values: string[];
};

export type ProductVariant = {
  id: string;
  title: string;
  availableForSale: boolean;
  selectedOptions: {
    name: string;
    value: string;
  }[];
  price: Money;
};

export type Product = {
  id: string;
  /** URL-safe identifier used in storefront routes. Providers without native
   * handles may use the product id. */
  handle: string;
  availableForSale: boolean;
  title: string;
  description: string;
  descriptionHtml: string;
  options: ProductOption[];
  priceRange: {
    maxVariantPrice: Money;
    minVariantPrice: Money;
  };
  featuredImage?: Image;
  seo: SEO;
  tags: string[];
  updatedAt: string;
  variants: ProductVariant[];
  images: Image[];
  /** Absolute URL of this product's page on the merchant's own storefront,
   * when the provider has one. The escape hatch for catalog-only providers:
   * a template can link "View on store" when local cart/checkout are
   * unavailable. */
  externalUrl?: string;
};

export type Collection = {
  handle: string;
  title: string;
  description: string;
  seo: SEO;
  updatedAt: string;
  /** Storefront-local path for this collection, e.g. "/search/shirts". */
  path: string;
};

export type CartProduct = {
  id: string;
  handle: string;
  title: string;
  featuredImage?: Image;
};

export type CartItem = {
  id: string;
  quantity: number;
  cost: {
    totalAmount: Money;
  };
  merchandise: {
    /** Variant id — the unit of purchase. */
    id: string;
    title: string;
    selectedOptions: {
      name: string;
      value: string;
    }[];
    product: CartProduct;
  };
};

export type Cart = {
  id: string;
  /** Absolute URL where this cart can be checked out. Only meaningful when
   * the provider declares the `checkout` capability. */
  checkoutUrl: string;
  cost: {
    subtotalAmount: Money;
    totalAmount: Money;
    totalTaxAmount: Money;
  };
  totalQuantity: number;
  lines: CartItem[];
};

export type Menu = {
  title: string;
  path: string;
};

export type Page = {
  id: string;
  title: string;
  handle: string;
  body: string;
  bodySummary: string;
  seo?: SEO;
  createdAt: string;
  updatedAt: string;
};
