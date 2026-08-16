/** Name of the cookie holding the active cart id. */
export const CART_COOKIE = "cartId";

/**
 * Structural subset of Next's request cookie store (`await cookies()` from
 * "next/headers" satisfies it). Kept structural so this package imports
 * nothing from Next and works across Next versions — and in tests.
 */
export type CookieStore = {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string): void;
};

export function getCartId(store: CookieStore): string | undefined {
  const value = store.get(CART_COOKIE)?.value;
  return value === "" ? undefined : value;
}

export function setCartId(store: CookieStore, cartId: string): void {
  store.set(CART_COOKIE, cartId);
}
