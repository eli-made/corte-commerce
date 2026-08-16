# @corte-so/commerce-next

Next.js glue for `@corte-so/commerce-core` providers: cart cookie helpers,
server-action-ready cart flows, and a webhook revalidation route handler.

Deliberately **imports nothing from Next**. You inject `cookies` and
`revalidateTag` from your app; the package stays version-agnostic, works under
any bundler, and tests without a Next runtime. (`await cookies()` from
`next/headers` structurally satisfies `CookieStore`.)

## Cart actions

```ts
// lib/commerce.ts — the app's single provider binding
import { shopifyProviderFromEnv } from "@corte-so/commerce-shopify";
export const commerce = shopifyProviderFromEnv();
```

```ts
// components/cart/actions.ts
"use server";

import { cookies } from "next/headers";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createCartActions, TAGS } from "@corte-so/commerce-next";
import { commerce } from "@/lib/commerce";

const cart = createCartActions({
  provider: commerce,
  cookies,
  revalidateCart: () => revalidateTag(TAGS.cart),
});

export async function addItem(_prev: unknown, merchandiseId: string) {
  return cart.addItem(merchandiseId);
}

export async function removeItem(_prev: unknown, merchandiseId: string) {
  return cart.removeItem(merchandiseId);
}

export async function updateItemQuantity(
  _prev: unknown,
  payload: { merchandiseId: string; quantity: number },
) {
  return cart.updateItemQuantity(payload);
}

export async function redirectToCheckout() {
  const url = await cart.getCheckoutUrl();
  if (url) redirect(url);
}
```

Semantics (inherited from Next.js Commerce, so existing storefront UIs drop
in): mutations get-or-create the cart and persist its id in the `cartId`
cookie; quantity `0` removes a line; updating a line that isn't in the cart
adds it; mutating functions return an error **string** on failure (the
`useActionState` convention) and `undefined` on success.

`createCartActions` throws immediately for a catalog-only provider
(`capabilities.cart: false`) — check capabilities and render a browse-only UI
instead.

## Revalidation webhooks

```ts
// app/api/revalidate/route.ts
import { revalidateTag } from "next/cache";
import { createRevalidateHandler } from "@corte-so/commerce-next";
import { commerce } from "@/lib/commerce";

export const POST = createRevalidateHandler({
  provider: commerce,
  revalidateTag,
});
```

The provider classifies the webhook (secret check + topic mapping); the
handler revalidates the matching tag (`TAGS.products` / `TAGS.collections`).
Unclassifiable requests — wrong secret, unknown topic, provider without
webhook support — are dropped with a 200 so providers don't retry and probes
learn nothing.

## Caching

Tag your data reads with the shared `TAGS` so webhook revalidation finds them:

```ts
import { cacheTag, cacheLife } from "next/cache";
import { TAGS } from "@corte-so/commerce-next";
import { commerce } from "@/lib/commerce";

export async function getProducts() {
  "use cache";
  cacheTag(TAGS.products);
  cacheLife("days");
  return commerce.getProducts();
}
```

`"use cache"` is a directive and must live in your app's source — a package
can't apply it for you, which is why this package ships tags, not wrappers.
