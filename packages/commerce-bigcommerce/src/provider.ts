import {
  requireConfig,
  type Cart,
  type CartLineInput,
  type CartLineUpdate,
  type Collection,
  type CommerceCapabilities,
  type CommerceProvider,
  type GetCollectionProductsOptions,
  type GetProductsOptions,
  type Menu,
  type Page,
  type Product,
} from "@corte-so/commerce-core";

import {
  createFetcher,
  PROVIDER_ID,
  type BigCommerceConfig,
  type BigCommerceFetcher,
} from "./fetch.js";
import {
  defaultSort,
  emptyCart,
  findCategoryId,
  nodes,
  parseMerchandiseId,
  pathFromSlug,
  slugFromPath,
  sorting,
  toCart,
  toCategorySort,
  toCollection,
  toFooterMenu,
  toHeaderMenu,
  toPage,
  toProduct,
  toProducts,
  toSearchSort,
} from "./mappers.js";
import {
  addCartLineItemsMutation,
  createCartMutation,
  createCartRedirectUrlsMutation,
  deleteCartLineItemMutation,
  updateCartLineItemMutation,
} from "./mutations/cart.js";
import { getCartQuery } from "./queries/cart.js";
import { getCategoryQuery, getStoreCategoriesQuery } from "./queries/category.js";
import { getCheckoutQuery } from "./queries/checkout.js";
import { getMenuQuery } from "./queries/menu.js";
import { getPageQuery, getPagesQuery } from "./queries/page.js";
import {
  getFeaturedProductsQuery,
  getNewestProductsQuery,
  getProductQuery,
  getProductRecommendationsQuery,
  getProductsCollectionQuery,
  searchProductsQuery,
} from "./queries/product.js";
import { getEntityIdByRouteQuery } from "./queries/route.js";
import type {
  AddCartLineItemsMutationData,
  BigCommerceCart,
  CartQueryData,
  CategoryQueryData,
  CategoryTreeQueryData,
  CheckoutQueryData,
  CreateCartMutationData,
  CreateCartRedirectUrlsMutationData,
  DeleteCartLineItemMutationData,
  FeaturedProductsQueryData,
  NewestProductsQueryData,
  PageQueryData,
  PagesQueryData,
  ProductQueryData,
  ProductsCollectionQueryData,
  RecommendationsQueryData,
  RouteQueryData,
  SearchProductsQueryData,
  UpdateCartLineItemMutationData,
} from "./types.js";

/** BigCommerce connections cap out at 50 nodes per page. */
const PAGE_SIZE = 50;
/** Size of the two Next.js Commerce homepage collections (see below). */
const HOMEPAGE_SHIM_SIZE = 10;

/**
 * Collection handles the Next.js Commerce template asks for on its homepage.
 * BigCommerce has no such categories, so they are served from the store's
 * newest and featured products instead.
 */
const HOMEPAGE_COLLECTIONS: Record<string, "newest" | "featured"> = {
  "hidden-homepage-carousel": "newest",
  "hidden-homepage-featured-items": "featured",
};

/** Header and footer menus, plus the handles the Next.js Commerce template uses. */
const MENU_HANDLES: Record<string, "header" | "footer"> = {
  header: "header",
  "next-js-frontend-header-menu": "header",
  footer: "footer",
  "next-js-frontend-footer-menu": "footer",
};

const capabilities: CommerceCapabilities = {
  cart: true,
  checkout: true,
  search: true,
  pages: true,
  menus: true,
  recommendations: true,
  // The upstream port's `revalidate` handler was a stub that acknowledged
  // every request without inspecting it; nothing here classifies BigCommerce
  // webhooks, so the flag stays false.
  webhooks: false,
};

export function createBigCommerceProvider(
  config: BigCommerceConfig,
): CommerceProvider {
  const fetcher: BigCommerceFetcher = createFetcher(config);
  const productOptions = { storefrontUrl: config.storefrontUrl };

  // --- identity resolution -------------------------------------------------

  const resolveRouteEntityId = async (
    slug: string,
  ): Promise<number | undefined> => {
    const base = pathFromSlug(slug);

    for (const path of [base, `${base}/`]) {
      const data = await fetcher.graphql<RouteQueryData>(
        getEntityIdByRouteQuery,
        { path },
      );
      const entityId = data.site.route.node?.entityId;
      if (typeof entityId === "number") return entityId;
    }

    return undefined;
  };

  /** Handles are storefront slugs, but a numeric id addresses the same
   * product — `Product.id` is the entity id, so both round-trip. */
  const resolveProductEntityId = async (
    handle: string,
  ): Promise<number | undefined> => {
    if (/^\d+$/.test(handle)) return Number.parseInt(handle, 10);
    return resolveRouteEntityId(handle);
  };

  const categoryTree = async () => {
    const data = await fetcher.graphql<CategoryTreeQueryData>(getMenuQuery);
    return data.site.categoryTree ?? [];
  };

  const resolveCategoryEntityId = async (
    handle: string,
  ): Promise<number | undefined> => {
    if (/^\d+$/.test(handle)) return Number.parseInt(handle, 10);
    return findCategoryId(await categoryTree(), handle);
  };

  // --- cart plumbing -------------------------------------------------------

  /**
   * Hosted checkout URL for a cart. Uses the Storefront GraphQL redirect-URL
   * mutation by default; when a store-level access token is configured the
   * v3 REST endpoint the upstream port used is called instead.
   */
  const resolveCheckoutUrl = async (cartId: string): Promise<string> => {
    if (!cartId) return "";

    if (config.accessToken) {
      const response = await fetcher.rest<{
        data?: { checkout_url?: string; embedded_checkout_url?: string };
      }>(`/v3/carts/${encodeURIComponent(cartId)}/redirect_urls`, {
        method: "POST",
      });

      return response.data?.checkout_url ?? "";
    }

    const data = await fetcher.graphql<CreateCartRedirectUrlsMutationData>(
      createCartRedirectUrlsMutation,
      { input: { cartEntityId: cartId } },
    );

    return (
      data.cart.createCartRedirectUrls.redirectUrls?.redirectedCheckoutUrl ?? ""
    );
  };

  /** Totals and the checkout URL live outside the cart resource, so every cart
   * read/write ends here. The two calls are independent and run together. */
  const hydrateCart = async (cart: BigCommerceCart): Promise<Cart> => {
    const [checkout, checkoutUrl] = await Promise.all([
      fetcher
        .graphql<CheckoutQueryData>(getCheckoutQuery, {
          entityId: cart.entityId,
        })
        .then((data) => data.site.checkout),
      resolveCheckoutUrl(cart.entityId),
    ]);

    return toCart(cart, { checkout, checkoutUrl });
  };

  const cartLineInput = (line: CartLineInput) => {
    const { productEntityId, variantEntityId } = parseMerchandiseId(
      line.merchandiseId,
    );

    return {
      productEntityId,
      ...(variantEntityId === undefined ? {} : { variantEntityId }),
      quantity: line.quantity,
    };
  };

  // --- catalog -------------------------------------------------------------

  const getProduct = async (handle: string): Promise<Product | null> => {
    const entityId = await resolveProductEntityId(handle);
    if (entityId === undefined) return null;

    const data = await fetcher.graphql<ProductQueryData>(getProductQuery, {
      entityId,
    });

    return data.site.product
      ? toProduct(data.site.product, productOptions)
      : null;
  };

  const getProducts = async (
    options: GetProductsOptions = {},
  ): Promise<Product[]> => {
    const data = await fetcher.graphql<SearchProductsQueryData>(
      searchProductsQuery,
      {
        filters: { searchTerm: options.query ?? "" },
        sort: toSearchSort(options.sortKey, options.reverse),
        first: PAGE_SIZE,
      },
    );

    return toProducts(
      nodes(data.site.search.searchProducts.products),
      productOptions,
    );
  };

  const getCollection = async (handle: string): Promise<Collection | null> => {
    const entityId = await resolveCategoryEntityId(handle);
    if (entityId === undefined) return null;

    const data = await fetcher.graphql<CategoryQueryData>(getCategoryQuery, {
      entityId,
    });

    return data.site.category ? toCollection(data.site.category) : null;
  };

  const getCollections = async (): Promise<Collection[]> => {
    const data = await fetcher.graphql<CategoryTreeQueryData>(
      getStoreCategoriesQuery,
    );
    const tree = data.site.categoryTree ?? [];

    // The tree carries no description or SEO, so each top-level category is
    // read in full. Storefronts have a handful of these, not thousands.
    const categories = await Promise.all(
      tree.map((item) =>
        fetcher.graphql<CategoryQueryData>(getCategoryQuery, {
          entityId: item.entityId,
        }),
      ),
    );

    return categories
      .map((response) => response.site.category)
      .filter((category): category is NonNullable<typeof category> =>
        Boolean(category),
      )
      .map(toCollection);
  };

  const getCollectionProducts = async (
    options: GetCollectionProductsOptions,
  ): Promise<Product[]> => {
    const shim = HOMEPAGE_COLLECTIONS[options.collection];

    if (shim === "newest") {
      const data = await fetcher.graphql<NewestProductsQueryData>(
        getNewestProductsQuery,
        { first: HOMEPAGE_SHIM_SIZE },
      );
      return toProducts(nodes(data.site.newestProducts), productOptions);
    }

    if (shim === "featured") {
      const data = await fetcher.graphql<FeaturedProductsQueryData>(
        getFeaturedProductsQuery,
        { first: HOMEPAGE_SHIM_SIZE },
      );
      return toProducts(nodes(data.site.featuredProducts), productOptions);
    }

    const entityId = await resolveCategoryEntityId(options.collection);
    if (entityId === undefined) return [];

    const data = await fetcher.graphql<ProductsCollectionQueryData>(
      getProductsCollectionQuery,
      {
        entityId,
        sortBy: toCategorySort(options.sortKey, options.reverse),
        hideOutOfStock: false,
        first: PAGE_SIZE,
      },
    );

    return toProducts(nodes(data.site.category?.products), productOptions);
  };

  const getProductRecommendations = async (
    productId: string,
  ): Promise<Product[]> => {
    const entityId = await resolveProductEntityId(productId);
    if (entityId === undefined) return [];

    const data = await fetcher.graphql<RecommendationsQueryData>(
      getProductRecommendationsQuery,
      { entityId, first: PAGE_SIZE },
    );

    return toProducts(
      nodes(data.site.product?.relatedProducts),
      productOptions,
    );
  };

  // --- content -------------------------------------------------------------

  const getPages = async (): Promise<Page[]> => {
    const data = await fetcher.graphql<PagesQueryData>(getPagesQuery);
    return nodes(data.site.content.pages).map(toPage);
  };

  const getPage = async (handle: string): Promise<Page | null> => {
    const entityId = await resolveRouteEntityId(handle);

    if (entityId !== undefined) {
      const data = await fetcher.graphql<PageQueryData>(getPageQuery, {
        entityId,
      });
      if (data.site.content.page) return toPage(data.site.content.page);
    }

    // Route lookup does not cover every page type on every store plan, so the
    // page list is the fallback — it already carries full bodies.
    const slug = slugFromPath(handle);
    return (await getPages()).find((page) => page.handle === slug) ?? null;
  };

  const getMenu = async (handle: string): Promise<Menu[]> => {
    const kind = MENU_HANDLES[handle];

    if (kind === "header") return toHeaderMenu(await categoryTree());

    if (kind === "footer") {
      const data = await fetcher.graphql<PagesQueryData>(getPagesQuery);
      return toFooterMenu(nodes(data.site.content.pages));
    }

    return [];
  };

  // --- cart ----------------------------------------------------------------

  const cart = {
    /**
     * BigCommerce cannot create an empty cart — a cart exists only once it has
     * a line item. This returns the placeholder empty cart; pass its empty id
     * to `addToCart` and the real cart is created there.
     */
    async createCart(): Promise<Cart> {
      return emptyCart();
    },

    async getCart(cartId: string): Promise<Cart | null> {
      if (!cartId) return null;

      const data = await fetcher.graphql<CartQueryData>(getCartQuery, {
        entityId: cartId,
      });

      return data.site.cart ? hydrateCart(data.site.cart) : null;
    },

    async addToCart(cartId: string, lines: CartLineInput[]): Promise<Cart> {
      const lineItems = lines.map(cartLineInput);

      if (!cartId) {
        const data = await fetcher.graphql<CreateCartMutationData>(
          createCartMutation,
          { createCartInput: { lineItems } },
        );
        return hydrateCart(data.cart.createCart.cart);
      }

      const data = await fetcher.graphql<AddCartLineItemsMutationData>(
        addCartLineItemsMutation,
        {
          addCartLineItemsInput: {
            cartEntityId: cartId,
            data: { lineItems },
          },
        },
      );

      return hydrateCart(data.cart.addCartLineItems.cart);
    },

    async updateCart(cartId: string, lines: CartLineUpdate[]): Promise<Cart> {
      let updated: BigCommerceCart | undefined;

      // BigCommerce updates one line per mutation, and each response carries
      // the whole cart — the last one is the current state.
      for (const line of lines) {
        const { productEntityId, variantEntityId } = parseMerchandiseId(
          line.merchandiseId,
        );

        const data = await fetcher.graphql<UpdateCartLineItemMutationData>(
          updateCartLineItemMutation,
          {
            updateCartLineItemInput: {
              cartEntityId: cartId,
              lineItemEntityId: line.id,
              data: {
                lineItem: {
                  productEntityId,
                  ...(variantEntityId === undefined ? {} : { variantEntityId }),
                  quantity: line.quantity,
                },
              },
            },
          },
        );

        updated = data.cart.updateCartLineItem.cart;
      }

      if (!updated) {
        const current = await cart.getCart(cartId);
        return current ?? emptyCart();
      }

      return hydrateCart(updated);
    },

    async removeFromCart(cartId: string, lineIds: string[]): Promise<Cart> {
      let remaining: BigCommerceCart | null | undefined;

      for (const lineItemEntityId of lineIds) {
        const data = await fetcher.graphql<DeleteCartLineItemMutationData>(
          deleteCartLineItemMutation,
          {
            deleteCartLineItemInput: {
              cartEntityId: cartId,
              lineItemEntityId,
            },
          },
        );

        remaining = data.cart.deleteCartLineItem.cart;

        // Removing the final line deletes the cart itself; there is nothing
        // left to delete from.
        if (!remaining) break;
      }

      if (remaining === undefined) {
        const current = await cart.getCart(cartId);
        return current ?? emptyCart();
      }

      return remaining ? hydrateCart(remaining) : emptyCart();
    },
  };

  return {
    id: PROVIDER_ID,
    capabilities,
    sorting,
    defaultSort,
    getProduct,
    getProducts,
    getCollection,
    getCollections,
    getCollectionProducts,
    getProductRecommendations,
    getMenu,
    getPage,
    getPages,
    cart,
  };
}

/**
 * Build a provider from environment variables.
 *
 * Required: `BIGCOMMERCE_STORE_HASH`,
 * `BIGCOMMERCE_CUSTOMER_IMPERSONATION_TOKEN`.
 * Optional: `BIGCOMMERCE_CHANNEL_ID`, `BIGCOMMERCE_STOREFRONT_URL`,
 * `BIGCOMMERCE_ACCESS_TOKEN`, `BIGCOMMERCE_API_URL`,
 * `BIGCOMMERCE_CANONICAL_STORE_DOMAIN`.
 */
export function bigCommerceProviderFromEnv(
  env: Record<string, string | undefined> = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env ?? {},
  overrides: Partial<BigCommerceConfig> = {},
): CommerceProvider {
  return createBigCommerceProvider({
    storeHash: requireConfig(env, "BIGCOMMERCE_STORE_HASH"),
    customerImpersonationToken: requireConfig(
      env,
      "BIGCOMMERCE_CUSTOMER_IMPERSONATION_TOKEN",
    ),
    ...(env.BIGCOMMERCE_CHANNEL_ID
      ? { channelId: env.BIGCOMMERCE_CHANNEL_ID }
      : {}),
    ...(env.BIGCOMMERCE_STOREFRONT_URL
      ? { storefrontUrl: env.BIGCOMMERCE_STOREFRONT_URL }
      : {}),
    ...(env.BIGCOMMERCE_ACCESS_TOKEN
      ? { accessToken: env.BIGCOMMERCE_ACCESS_TOKEN }
      : {}),
    ...(env.BIGCOMMERCE_API_URL ? { apiUrl: env.BIGCOMMERCE_API_URL } : {}),
    ...(env.BIGCOMMERCE_CANONICAL_STORE_DOMAIN
      ? { storeDomain: env.BIGCOMMERCE_CANONICAL_STORE_DOMAIN }
      : {}),
    ...overrides,
  });
}
