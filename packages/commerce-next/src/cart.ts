import type { Cart, CommerceProvider } from "@corte-so/commerce-core";
import { CommerceConfigError } from "@corte-so/commerce-core";
import type { CookieStore } from "./cookies.js";
import { getCartId, setCartId } from "./cookies.js";

export type CartActionDeps = {
  provider: CommerceProvider;
  /** Usually `cookies` from "next/headers". */
  cookies: () => CookieStore | Promise<CookieStore>;
  /** Called after any mutation — usually `() => revalidateTag(TAGS.cart)`.
   * Injected so this package never imports "next/cache" (and stays testable). */
  revalidateCart?: () => void;
};

/**
 * Cart flows for server actions, with the semantics storefront UIs expect
 * (ported from Next.js Commerce): mutations get-or-create the cart and set
 * the cookie; quantity 0 removes; updating a line that isn't in the cart adds
 * it. Mutating functions return an error string on failure (the
 * `useActionState` convention) and undefined on success.
 *
 * Wrap these in your app's own `"use server"` file — a factory result cannot
 * itself be a server action.
 */
export function createCartActions(deps: CartActionDeps) {
  const { provider } = deps;
  const cartOps = provider.cart;
  if (!cartOps) {
    throw new CommerceConfigError(
      `Provider "${provider.id}" has no cart support (capabilities.cart is false). ` +
        "Render a catalog-only UI instead of wiring cart actions.",
    );
  }
  const revalidate = deps.revalidateCart ?? (() => {});

  async function currentCart(): Promise<Cart | null> {
    const store = await deps.cookies();
    const cartId = getCartId(store);
    if (!cartId) return null;
    return cartOps!.getCart(cartId);
  }

  async function ensureCart(): Promise<Cart> {
    const store = await deps.cookies();
    const cartId = getCartId(store);
    if (cartId) {
      const existing = await cartOps!.getCart(cartId);
      if (existing) return existing;
    }
    const cart = await cartOps!.createCart();
    setCartId(store, cart.id);
    return cart;
  }

  return {
    /** Read the cart for the current cookie, or null when there is none. */
    getCart: currentCart,

    /** Create a cart and persist its id — for optimistic-cart bootstraps. */
    async createCartAndSetCookie(): Promise<Cart> {
      const store = await deps.cookies();
      const cart = await cartOps!.createCart();
      setCartId(store, cart.id);
      return cart;
    },

    async addItem(merchandiseId: string, quantity = 1): Promise<string | undefined> {
      if (!merchandiseId) return "Error adding item to cart";
      try {
        const cart = await ensureCart();
        await cartOps!.addToCart(cart.id, [{ merchandiseId, quantity }]);
        revalidate();
        return undefined;
      } catch {
        return "Error adding item to cart";
      }
    },

    async removeItem(merchandiseId: string): Promise<string | undefined> {
      try {
        const cart = await currentCart();
        if (!cart) return "Error fetching cart";
        const line = cart.lines.find((l) => l.merchandise.id === merchandiseId);
        if (!line) return "Item not found in cart";
        await cartOps!.removeFromCart(cart.id, [line.id]);
        revalidate();
        return undefined;
      } catch {
        return "Error removing item from cart";
      }
    },

    async updateItemQuantity(payload: {
      merchandiseId: string;
      quantity: number;
    }): Promise<string | undefined> {
      const { merchandiseId, quantity } = payload;
      try {
        const cart = await currentCart();
        if (!cart) return "Error fetching cart";
        const line = cart.lines.find((l) => l.merchandise.id === merchandiseId);
        if (line) {
          if (quantity === 0) {
            await cartOps!.removeFromCart(cart.id, [line.id]);
          } else {
            await cartOps!.updateCart(cart.id, [
              { id: line.id, merchandiseId, quantity },
            ]);
          }
        } else if (quantity > 0) {
          await cartOps!.addToCart(cart.id, [{ merchandiseId, quantity }]);
        }
        revalidate();
        return undefined;
      } catch {
        return "Error updating item quantity";
      }
    },

    /** Checkout URL for the current cart, or null when there is no cart.
     * Feed it to `redirect()` in your action. */
    async getCheckoutUrl(): Promise<string | null> {
      const cart = await currentCart();
      return cart?.checkoutUrl ?? null;
    },
  };
}
