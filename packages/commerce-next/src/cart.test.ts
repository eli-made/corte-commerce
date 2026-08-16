import { describe, expect, it, vi } from "vitest";
import type {
  Cart,
  CartLineInput,
  CartLineUpdate,
  CommerceProvider,
  Money,
} from "@corte-so/commerce-core";
import { createCartActions } from "./cart.js";
import { CART_COOKIE, type CookieStore } from "./cookies.js";
import { createRevalidateHandler, TAGS } from "./revalidate.js";

const zero: Money = { amount: "0.00", currencyCode: "USD" };

function makeCart(id: string, lines: Cart["lines"] = []): Cart {
  return {
    id,
    checkoutUrl: `https://checkout.example/${id}`,
    cost: { subtotalAmount: zero, totalAmount: zero, totalTaxAmount: zero },
    totalQuantity: lines.reduce((n, l) => n + l.quantity, 0),
    lines,
  };
}

function makeLine(lineId: string, merchandiseId: string, quantity = 1): Cart["lines"][number] {
  return {
    id: lineId,
    quantity,
    cost: { totalAmount: zero },
    merchandise: {
      id: merchandiseId,
      title: "Variant",
      selectedOptions: [],
      product: { id: "p1", handle: "p1", title: "Product" },
    },
  };
}

function fakeCookies(): CookieStore & { jar: Map<string, string> } {
  const jar = new Map<string, string>();
  return {
    jar,
    get: (name) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
    set: (name, value) => void jar.set(name, value),
  };
}

function fakeProvider(carts: Map<string, Cart>): CommerceProvider {
  let counter = 0;
  return {
    id: "fake",
    capabilities: {
      cart: true,
      checkout: true,
      search: false,
      pages: false,
      menus: false,
      recommendations: false,
      webhooks: false,
    },
    sorting: [{ title: "Relevance", slug: null, sortKey: "relevance", reverse: false }],
    get defaultSort() {
      return this.sorting[0]!;
    },
    getProduct: async () => null,
    getProducts: async () => [],
    getCollection: async () => null,
    getCollections: async () => [],
    getCollectionProducts: async () => [],
    cart: {
      createCart: async () => {
        const cart = makeCart(`cart-${++counter}`);
        carts.set(cart.id, cart);
        return cart;
      },
      getCart: async (cartId: string) => carts.get(cartId) ?? null,
      addToCart: async (cartId: string, lines: CartLineInput[]) => {
        const cart = carts.get(cartId)!;
        for (const line of lines) {
          cart.lines.push(makeLine(`line-${line.merchandiseId}`, line.merchandiseId, line.quantity));
        }
        return cart;
      },
      updateCart: async (cartId: string, lines: CartLineUpdate[]) => {
        const cart = carts.get(cartId)!;
        for (const update of lines) {
          const line = cart.lines.find((l) => l.id === update.id);
          if (line) line.quantity = update.quantity;
        }
        return cart;
      },
      removeFromCart: async (cartId: string, lineIds: string[]) => {
        const cart = carts.get(cartId)!;
        cart.lines = cart.lines.filter((l) => !lineIds.includes(l.id));
        return cart;
      },
    },
  };
}

function setup() {
  const carts = new Map<string, Cart>();
  const provider = fakeProvider(carts);
  const cookies = fakeCookies();
  const revalidateCart = vi.fn();
  const actions = createCartActions({
    provider,
    cookies: () => cookies,
    revalidateCart,
  });
  return { carts, provider, cookies, revalidateCart, actions };
}

describe("createCartActions", () => {
  it("refuses a catalog-only provider with a clear error", () => {
    const provider = { ...fakeProvider(new Map()) };
    delete (provider as { cart?: unknown }).cart;
    provider.capabilities = { ...provider.capabilities, cart: false, checkout: false };
    expect(() =>
      createCartActions({ provider, cookies: fakeCookies }),
    ).toThrow(/no cart support/);
  });

  it("addItem creates a cart and sets the cookie when none exists", async () => {
    const { actions, cookies, carts, revalidateCart } = setup();
    const error = await actions.addItem("m1");
    expect(error).toBeUndefined();
    const cartId = cookies.jar.get(CART_COOKIE);
    expect(cartId).toBeDefined();
    expect(carts.get(cartId!)?.lines).toHaveLength(1);
    expect(revalidateCart).toHaveBeenCalledOnce();
  });

  it("addItem reuses the existing cart from the cookie", async () => {
    const { actions, cookies } = setup();
    await actions.addItem("m1");
    const firstId = cookies.jar.get(CART_COOKIE);
    await actions.addItem("m2");
    expect(cookies.jar.get(CART_COOKIE)).toBe(firstId);
  });

  it("addItem recreates the cart when the cookie points at an expired cart", async () => {
    const { actions, cookies, carts } = setup();
    cookies.jar.set(CART_COOKIE, "gone");
    const error = await actions.addItem("m1");
    expect(error).toBeUndefined();
    const newId = cookies.jar.get(CART_COOKIE);
    expect(newId).not.toBe("gone");
    expect(carts.get(newId!)?.lines).toHaveLength(1);
  });

  it("removeItem reports a missing cart and a missing line distinctly", async () => {
    const { actions } = setup();
    expect(await actions.removeItem("m1")).toBe("Error fetching cart");
    await actions.addItem("m2");
    expect(await actions.removeItem("m1")).toBe("Item not found in cart");
  });

  it("removeItem removes the matching line", async () => {
    const { actions, cookies, carts } = setup();
    await actions.addItem("m1");
    expect(await actions.removeItem("m1")).toBeUndefined();
    expect(carts.get(cookies.jar.get(CART_COOKIE)!)?.lines).toHaveLength(0);
  });

  it("updateItemQuantity: 0 removes, >0 updates, missing line adds", async () => {
    const { actions, cookies, carts } = setup();
    await actions.addItem("m1");
    const cart = () => carts.get(cookies.jar.get(CART_COOKIE)!)!;

    await actions.updateItemQuantity({ merchandiseId: "m1", quantity: 3 });
    expect(cart().lines[0]?.quantity).toBe(3);

    await actions.updateItemQuantity({ merchandiseId: "m2", quantity: 2 });
    expect(cart().lines).toHaveLength(2);

    await actions.updateItemQuantity({ merchandiseId: "m1", quantity: 0 });
    expect(cart().lines.map((l) => l.merchandise.id)).toEqual(["m2"]);
  });

  it("getCheckoutUrl returns null without a cart and the URL with one", async () => {
    const { actions, cookies } = setup();
    expect(await actions.getCheckoutUrl()).toBeNull();
    await actions.addItem("m1");
    expect(await actions.getCheckoutUrl()).toBe(
      `https://checkout.example/${cookies.jar.get(CART_COOKIE)}`,
    );
  });
});

describe("createRevalidateHandler", () => {
  const request = (url = "https://site.example/api/revalidate?secret=s") =>
    new Request(url, { method: "POST" });

  it("drops everything for providers without webhook support", async () => {
    const provider = fakeProvider(new Map());
    const revalidateTag = vi.fn();
    const handler = createRevalidateHandler({ provider, revalidateTag });
    const res = await handler(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ revalidated: false });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("revalidates the mapped tag when the provider classifies the webhook", async () => {
    const provider = fakeProvider(new Map());
    provider.capabilities = { ...provider.capabilities, webhooks: true };
    (provider as { webhooks?: unknown }).webhooks = {
      classify: () => ({ scope: "products" as const }),
    };
    const revalidateTag = vi.fn();
    const handler = createRevalidateHandler({ provider, revalidateTag });
    const res = await handler(request());
    expect(await res.json()).toMatchObject({ revalidated: true });
    expect(revalidateTag).toHaveBeenCalledWith(TAGS.products);
  });
});
