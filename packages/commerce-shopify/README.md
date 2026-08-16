# @corte-so/commerce-shopify

Shopify [Storefront API](https://shopify.dev/docs/api/storefront) provider for
the [`@corte-so/commerce-core`](../commerce-core) contract. It's the reference
implementation of the contract: everything a storefront can ask for, Shopify
answers.

Framework-free — no Next.js, no cookies, no ambient state, no caching. It
speaks GraphQL over `fetch` and returns neutral domain objects. Runs anywhere
`fetch` does (Node 18+, Cloudflare Workers, Deno, browsers).

## Capabilities

| Capability | Supported | Notes |
| --- | --- | --- |
| Catalog | ✅ | `getProduct`, `getProducts`, `getCollection`, `getCollections`, `getCollectionProducts` |
| `cart` | ✅ | Storefront Cart API; the cart id is always an explicit argument |
| `checkout` | ✅ | `Cart.checkoutUrl` is Shopify's hosted checkout |
| `search` | ✅ | `getProducts({ query })` is a real server-side search |
| `pages` | ✅ | `getPage` / `getPages` over Shopify Pages |
| `menus` | ✅ | `getMenu(handle)`, URLs rewritten to storefront-local paths |
| `recommendations` | ✅ | `getProductRecommendations(productId)` |
| `webhooks` | ✅ | `webhooks.classify` for product/collection revalidation |

## Configuration

```ts
createShopifyProvider({
  storeDomain: "acme.myshopify.com", // with or without protocol/trailing slash
  storefrontAccessToken: "shpat_…",
  revalidationSecret: "…",           // optional; required for webhooks
  apiVersion: "2025-10",             // optional; defaults to DEFAULT_SHOPIFY_API_VERSION
  fetch: myFetch,                    // optional; defaults to globalThis.fetch
});
```

Or from the environment — `shopifyProviderFromEnv()` reads:

| Variable | Required | Purpose |
| --- | --- | --- |
| `SHOPIFY_STORE_DOMAIN` | yes | Store domain, e.g. `acme.myshopify.com` |
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | yes | Storefront API access token |
| `SHOPIFY_REVALIDATION_SECRET` | no | Shared secret for the webhook endpoint |
| `SHOPIFY_API_VERSION` | no | Pin the Storefront API version |

Missing required variables throw `CommerceConfigError` naming the exact key —
config is never read at module scope, so importing this package is always safe.

### Getting a Storefront API token

Shopify admin → **Settings → Apps and sales channels → Develop apps** → create
(or open) an app → **Configuration → Storefront API** → grant at least
`unauthenticated_read_product_listings`, `unauthenticated_read_product_tags`,
`unauthenticated_read_content` (pages/menus), and the
`unauthenticated_write_checkouts` / `unauthenticated_read_checkouts` scopes for
cart operations → **API credentials** → install the app and copy the
**Storefront API access token**. This token is public by design (it ships to
browsers in Shopify's own themes), but this package still never puts it in an
error message.

## Usage

```ts
import { createShopifyProvider } from "@corte-so/commerce-shopify";

const shopify = createShopifyProvider({
  storeDomain: process.env.SHOPIFY_STORE_DOMAIN!,
  storefrontAccessToken: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN!,
});

// Catalog
const newest = await shopify.getProducts({ sortKey: "created-at", reverse: true });
const tee = await shopify.getProduct("acme-tee"); // null when the handle is unknown
const shirts = await shopify.getCollectionProducts({ collection: "shirts" });

// Cart — the id is yours to persist (cookie, session, KV, …)
const cart = await shopify.cart!.createCart();
const withItem = await shopify.cart!.addToCart(cart.id, [
  { merchandiseId: tee!.variants[0]!.id, quantity: 1 },
]);
await shopify.cart!.updateCart(cart.id, [
  { id: withItem.lines[0]!.id, merchandiseId: tee!.variants[0]!.id, quantity: 2 },
]);
await shopify.cart!.removeFromCart(cart.id, [withItem.lines[0]!.id]);

// `null` for an id that's unknown or already checked out — create a new cart
const existing = await shopify.cart!.getCart(someStoredId);
```

Caching is the caller's job. Nothing here memoizes, so wrap calls in whatever
your host offers (`unstable_cache`, `caches.default`, a Redis read-through, …).
[`@corte-so/commerce-next`](../commerce-next) does this plus cookie-backed cart
identity for Next.js apps.

## Webhooks

Point a Shopify webhook (`products/*`, `collections/*`) at your own route with
`?secret=<SHOPIFY_REVALIDATION_SECRET>` and let the provider classify it:

```ts
export async function POST(request: Request) {
  const hint = shopify.webhooks!.classify({
    headers: Object.fromEntries(request.headers),
    searchParams: new URL(request.url).searchParams,
  });

  if (hint?.scope === "products") revalidateTag("products");
  if (hint?.scope === "collections") revalidateTag("collections");

  // Always 200 — Shopify retries anything else.
  return Response.json({ ok: true });
}
```

`classify` returns `null` for a wrong or missing secret, for topics that don't
affect the storefront, and whenever no `revalidationSecret` is configured (an
unauthenticated invalidation endpoint is worse than none). Answering the
request is the host's job — the provider only says what changed.

## Behavior worth knowing

- **Hidden products.** Products tagged `corte-frontend-hidden` (core's
  `HIDDEN_PRODUCT_TAG`) are dropped from listings, but `getProduct(handle)`
  still returns them so their own page keeps working.
- **The "All" collection.** `getCollections()` prepends a synthetic
  `{ handle: "", path: "/search" }` entry and filters out `hidden-*`
  collections, which merchants use for merchandising slots rather than
  navigation.
- **Sorting.** Neutral `ProductSortKey`s map to `ProductSortKeys` for product
  queries and `ProductCollectionSortKeys` for collection queries — note
  Shopify spells creation date `CREATED_AT` in one and `CREATED` in the other.
- **Tax.** Shopify leaves `totalTaxAmount` null until it knows a destination;
  it's reported as `0.0` in the cart's own currency.
- **SEO and alt text.** Nullable Storefront fields fall back to the resource's
  own title/description, and images without alt text get
  `"<product title> - <filename>"`.
- **`externalUrl`.** Every product carries
  `https://<storeDomain>/products/<handle>` so a UI can always link to the
  merchant's own storefront.
- **Errors.** Transport failures, non-2xx responses, and GraphQL `errors` all
  become `CommerceApiError` with `provider: "shopify"` and the HTTP status. The
  access token is redacted from any message that would contain it.

## Tests

```bash
npx vitest run packages/commerce-shopify          # unit tests, fake fetch, no credentials

COMMERCE_INTEGRATION=1 \
SHOPIFY_STORE_DOMAIN=… SHOPIFY_STOREFRONT_ACCESS_TOKEN=… \
  npx vitest run packages/commerce-shopify        # + live read-only checks
```
