import type {
  CartLineInput,
  CartLineUpdate,
  Collection,
  CommerceProvider,
  GetCollectionProductsOptions,
  GetProductsOptions,
  Menu,
  Page,
  Product,
  Cart,
} from "@corte-so/commerce-core";
import {
  resolveConfig,
  shopifyConfigFromEnv,
  type ShopifyProviderConfig,
} from "./config.js";
import { createShopifyGraphQL } from "./fetch.js";
import {
  reshapeCart,
  reshapeCollection,
  reshapeCollections,
  reshapeMenuItem,
  reshapePage,
  reshapeProduct,
  reshapeProducts,
  removeEdgesAndNodes,
} from "./mappers.js";
import {
  addToCartMutation,
  createCartMutation,
  editCartItemsMutation,
  removeFromCartMutation,
} from "./mutations/cart.js";
import { getCartQuery } from "./queries/cart.js";
import {
  getCollectionProductsQuery,
  getCollectionQuery,
  getCollectionsQuery,
} from "./queries/collection.js";
import { getMenuQuery } from "./queries/menu.js";
import { getPageQuery, getPagesQuery } from "./queries/page.js";
import {
  getProductQuery,
  getProductRecommendationsQuery,
  getProductsQuery,
} from "./queries/product.js";
import { defaultSort, sorting, toCollectionSortKey, toProductSortKey } from "./sorting.js";
import type {
  AddToCartData,
  CreateCartData,
  GetCartData,
  GetCollectionData,
  GetCollectionProductsData,
  GetCollectionsData,
  GetMenuData,
  GetPageData,
  GetPagesData,
  GetProductData,
  GetProductRecommendationsData,
  GetProductsData,
  RemoveFromCartData,
  UpdateCartData,
} from "./types.js";
import { createShopifyWebhooks } from "./webhooks.js";

/**
 * The catch-all collection every storefront lists first. It has no Shopify
 * counterpart — `/search` with no handle means "everything".
 */
function allProductsCollection(): Collection {
  return {
    handle: "",
    title: "All",
    description: "All products",
    seo: { title: "All", description: "All products" },
    path: "/search",
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Build a Shopify Storefront API provider. Config is injected — nothing here
 * reads env vars, cookies, or any other ambient state; caching belongs to the
 * caller.
 */
export function createShopifyProvider(config: ShopifyProviderConfig): CommerceProvider {
  const resolved = resolveConfig(config);
  const { storeUrl } = resolved;
  const graphql = createShopifyGraphQL(resolved);

  return {
    id: "shopify",

    capabilities: {
      cart: true,
      checkout: true,
      search: true,
      pages: true,
      menus: true,
      recommendations: true,
      webhooks: true,
    },

    sorting,
    defaultSort,

    async getProduct(handle: string): Promise<Product | null> {
      const data = await graphql<GetProductData>(getProductQuery, { handle });
      // A product fetched by handle is shown even when tagged hidden — the
      // tag hides products from listings, not from their own page.
      return reshapeProduct(data.product, { storeUrl, filterHidden: false }) ?? null;
    },

    async getProducts(options: GetProductsOptions = {}): Promise<Product[]> {
      const data = await graphql<GetProductsData>(getProductsQuery, {
        query: options.query,
        reverse: options.reverse,
        sortKey: toProductSortKey(options.sortKey),
      });
      return reshapeProducts(removeEdgesAndNodes(data.products), { storeUrl });
    },

    async getCollection(handle: string): Promise<Collection | null> {
      const data = await graphql<GetCollectionData>(getCollectionQuery, { handle });
      return reshapeCollection(data.collection) ?? null;
    },

    async getCollections(): Promise<Collection[]> {
      const data = await graphql<GetCollectionsData>(getCollectionsQuery);
      return [
        allProductsCollection(),
        // `hidden-*` collections back merchandising slots (homepage carousels
        // and such) and must not show up in storefront navigation.
        ...reshapeCollections(removeEdgesAndNodes(data.collections)).filter(
          (collection) => !collection.handle.startsWith("hidden"),
        ),
      ];
    },

    async getCollectionProducts(
      options: GetCollectionProductsOptions,
    ): Promise<Product[]> {
      const data = await graphql<GetCollectionProductsData>(
        getCollectionProductsQuery,
        {
          handle: options.collection,
          reverse: options.reverse,
          sortKey: toCollectionSortKey(options.sortKey),
        },
      );
      if (!data.collection) return [];
      return reshapeProducts(removeEdgesAndNodes(data.collection.products), {
        storeUrl,
      });
    },

    async getMenu(handle: string): Promise<Menu[]> {
      const data = await graphql<GetMenuData>(getMenuQuery, { handle });
      return (data.menu?.items ?? []).map((item) => reshapeMenuItem(item, storeUrl));
    },

    async getPage(handle: string): Promise<Page | null> {
      const data = await graphql<GetPageData>(getPageQuery, { handle });
      return reshapePage(data.pageByHandle);
    },

    async getPages(): Promise<Page[]> {
      const data = await graphql<GetPagesData>(getPagesQuery);
      return removeEdgesAndNodes(data.pages)
        .map(reshapePage)
        .filter((page): page is Page => page !== null);
    },

    async getProductRecommendations(productId: string): Promise<Product[]> {
      const data = await graphql<GetProductRecommendationsData>(
        getProductRecommendationsQuery,
        { productId },
      );
      return reshapeProducts(data.productRecommendations ?? [], { storeUrl });
    },

    cart: {
      async createCart(): Promise<Cart> {
        const data = await graphql<CreateCartData>(createCartMutation);
        return reshapeCart(data.cartCreate.cart);
      },

      async getCart(cartId: string): Promise<Cart | null> {
        const data = await graphql<GetCartData>(getCartQuery, { cartId });
        // Shopify returns a null cart for ids that are unknown or have already
        // been checked out.
        return data.cart ? reshapeCart(data.cart) : null;
      },

      async addToCart(cartId: string, lines: CartLineInput[]): Promise<Cart> {
        const data = await graphql<AddToCartData>(addToCartMutation, {
          cartId,
          lines,
        });
        return reshapeCart(data.cartLinesAdd.cart);
      },

      async updateCart(cartId: string, lines: CartLineUpdate[]): Promise<Cart> {
        const data = await graphql<UpdateCartData>(editCartItemsMutation, {
          cartId,
          lines,
        });
        return reshapeCart(data.cartLinesUpdate.cart);
      },

      async removeFromCart(cartId: string, lineIds: string[]): Promise<Cart> {
        const data = await graphql<RemoveFromCartData>(removeFromCartMutation, {
          cartId,
          lineIds,
        });
        return reshapeCart(data.cartLinesRemove.cart);
      },
    },

    webhooks: createShopifyWebhooks(resolved.revalidationSecret),
  };
}

/**
 * Convenience wrapper reading `SHOPIFY_STORE_DOMAIN`,
 * `SHOPIFY_STOREFRONT_ACCESS_TOKEN`, and the optional
 * `SHOPIFY_REVALIDATION_SECRET` / `SHOPIFY_API_VERSION`.
 */
export function shopifyProviderFromEnv(
  env?: Record<string, string | undefined>,
  overrides?: Pick<ShopifyProviderConfig, "fetch">,
): CommerceProvider {
  return createShopifyProvider({ ...shopifyConfigFromEnv(env), ...overrides });
}
