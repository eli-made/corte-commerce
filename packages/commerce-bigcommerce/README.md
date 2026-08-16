# @corte-so/commerce-bigcommerce

BigCommerce [Storefront GraphQL API](https://developer.bigcommerce.com/docs/storefront/graphql)
provider for the [`@corte-so/commerce-core`](../commerce-core) contract. Full
catalog, cart, checkout, search, pages, menus and recommendations — everything
BigCommerce's storefront surface exposes, mapped onto neutral domain types.

Framework-free — no Next.js, no cookies, no ambient state, no caching. It
speaks GraphQL over `fetch` and returns neutral domain objects. Runs anywhere
`fetch` does (Node 18+, Cloudflare Workers, Deno, browsers).

## Capabilities

| Capability | Supported | Notes |
| --- | --- | --- |
| Catalog | ✅ | `getProduct`, `getProducts`, `getCollection`, `getCollections`, `getCollectionProducts` |
| `cart` | ✅ | Storefront cart mutations; the cart id is always an explicit argument |
| `checkout` | ✅ | `Cart.checkoutUrl` is BigCommerce's hosted checkout |
| `search` | ✅ | `getProducts({ query })` is `site.search.searchProducts`, server-side |
| `pages` | ✅ | `getPage` / `getPages` over BigCommerce web pages |
| `menus` | ✅ | `getMenu("header" \| "footer")` — see [Menus](#menus) |
| `recommendations` | ✅ | `getProductRecommendations(productId)` via `relatedProducts` |
| `webhooks` | ❌ | Nothing here classifies BigCommerce webhooks |
| Agent tools | ✅ | All five verbs, over the management REST APIs — see [Agent tools](#agent-tools) |

## Configuration

```ts
createBigCommerceProvider({
  storeHash: "abc123",                       // from the store's API path
  customerImpersonationToken: "eyJ…",         // Storefront API token
  channelId: "1",                            // optional; channel 1 is the default storefront
  storefrontUrl: "https://store.example.com", // optional; used for Product.externalUrl
  accessToken: "…",                          // optional; see Checkout below
  fetch: myFetch,                            // optional; defaults to globalThis.fetch
});
```

Or from the environment — `bigCommerceProviderFromEnv()` reads:

| Variable | Required | Purpose |
| --- | --- | --- |
| `BIGCOMMERCE_STORE_HASH` | yes | Store hash, e.g. `abc123` |
| `BIGCOMMERCE_CUSTOMER_IMPERSONATION_TOKEN` | yes | Storefront API token |
| `BIGCOMMERCE_CHANNEL_ID` | no | Storefront channel; anything other than `1` is added to the GraphQL host |
| `BIGCOMMERCE_STOREFRONT_URL` | no | Public storefront origin, for `Product.externalUrl` |
| `BIGCOMMERCE_ACCESS_TOKEN` | no | Store-level API account token; switches checkout URLs to the v3 REST endpoint |
| `BIGCOMMERCE_API_URL` | no | Override the store management API host |
| `BIGCOMMERCE_CANONICAL_STORE_DOMAIN` | no | Override the canonical store domain (default `mybigcommerce.com`) |

Missing required variables throw `CommerceConfigError` naming the exact key —
config is never read at module scope, so importing this package is always safe.

The GraphQL endpoint is derived, not configured:
`https://store-<hash>[-<channel>].mybigcommerce.com/graphql`.

### Getting a Storefront API token

BigCommerce control panel → **Settings → API → Storefront API tokens** →
**Create token**. The dialog mints what the REST API calls a *customer
impersonation token*; that string is `BIGCOMMERCE_CUSTOMER_IMPERSONATION_TOKEN`.

Two things to note when minting it:

- **It is channel-scoped.** A token issued for channel 1 cannot read channel 9,
  so `BIGCOMMERCE_CHANNEL_ID` and the token have to agree.
- **It expires.** Tokens carry an explicit expiry — pick a long one and diary
  the rotation, or storefront reads start failing with a 401.

`BIGCOMMERCE_ACCESS_TOKEN` is a different, more powerful credential: a v3 API
account token (**Settings → API → API accounts**) with the *Carts* scope. It is
optional, server-only, and must never reach a browser.

## Usage

```ts
import { createBigCommerceProvider } from "@corte-so/commerce-bigcommerce";

const bigcommerce = createBigCommerceProvider({
  storeHash: process.env.BIGCOMMERCE_STORE_HASH!,
  customerImpersonationToken:
    process.env.BIGCOMMERCE_CUSTOMER_IMPERSONATION_TOKEN!,
});

// Catalog
const newest = await bigcommerce.getProducts({ sortKey: "created-at", reverse: true });
const tee = await bigcommerce.getProduct("acme-tee"); // null when the handle is unknown
const shirts = await bigcommerce.getCollectionProducts({ collection: "shirts" });

// Cart — the id is yours to persist (cookie, session, KV, …).
// BigCommerce has no empty cart, so the first add creates it: pass "".
const created = await bigcommerce.cart!.addToCart("", [
  { merchandiseId: tee!.variants[0]!.id, quantity: 1 },
]);
await bigcommerce.cart!.updateCart(created.id, [
  { id: created.lines[0]!.id, merchandiseId: tee!.variants[0]!.id, quantity: 2 },
]);
await bigcommerce.cart!.removeFromCart(created.id, [created.lines[0]!.id]);

// `null` for an id that's unknown or expired — start a new cart
const existing = await bigcommerce.cart!.getCart(someStoredId);
```

Caching is the caller's job. Nothing here memoizes, so wrap calls in whatever
your host offers (`unstable_cache`, `caches.default`, a Redis read-through, …).
[`@corte-so/commerce-next`](../commerce-next) does this plus cookie-backed cart
identity for Next.js apps.

## Behavior worth knowing

### Identifiers

- **`Product.id` is the BigCommerce entity id** (`"111"`), and `handle` is the
  storefront slug from the product's path (`"blue-shirt"`). `getProduct` accepts
  either: a numeric handle is used directly, anything else is resolved through
  `site.route`.
- **Merchandise ids are `productEntityId:variantEntityId`** (`"111:222"`).
  BigCommerce's cart mutations need both, while core's `CartLineInput` carries
  one opaque id — encoding the pair into the id this package hands out keeps
  cart operations self-sufficient (no slug lookups, no extra round trips). A
  bare `"111"` is accepted and read as a product with no variant, which is how
  BigCommerce addresses single-variant products.
- **Collection handles are category slugs**, and `Collection.path` is
  `/search/<handle>`. `getCollection` / `getCollectionProducts` accept a numeric
  category id too.

### Cart and checkout

- **There is no empty cart.** BigCommerce creates a cart with its first line
  item, so `createCart()` returns a placeholder with `id: ""` and no API call.
  Pass that empty id to `addToCart` and the real cart is created there.
  Symmetrically, removing the last line deletes the cart, and `removeFromCart`
  then reports the same empty cart.
- **Totals come from the checkout.** A BigCommerce cart carries only its own
  `amount`; subtotal, tax and grand total live on `site.checkout` for the same
  entity id, which every cart read and write fetches. Before a checkout exists,
  the cart amount stands in for subtotal and total, and tax reports `0.00`.
- **`checkoutUrl`** is the hosted `redirectedCheckoutUrl` from the Storefront
  `createCartRedirectUrls` mutation — no extra credential needed. When
  `accessToken` is configured, `POST /v3/carts/{id}/redirect_urls` is used
  instead and the `checkout_url` field is taken. Both also return an *embedded*
  checkout URL, for BigCommerce's embedded-checkout SDK; this package does not
  use it.
- **Cart lines never re-fetch the catalog.** Line items already carry the
  product name, URL and image, which is everything core's `CartProduct` needs.
  Custom items — merchant-invented lines with no catalog product — map to a
  product with an empty id and handle.

### Catalog mapping

- **Money.** The Storefront API returns JSON numbers; every amount is emitted as
  a two-decimal string (`25` → `"25.00"`) with the ISO currency code, per core's
  `Money`.
- **Hidden products.** Products whose SEO keywords include
  `corte-frontend-hidden` (core's `HIDDEN_PRODUCT_TAG`) are dropped from
  listings, but `getProduct(handle)` still returns them so their own page keeps
  working. `Product.tags` is the comma-split SEO keyword list — BigCommerce has
  no tag primitive.
- **Synthesised fields.** Three core fields have no BigCommerce source and are
  derived instead: `ProductVariant.title` from the variant's selected option
  values (`"Small / Blue"`, or `"Default Title"` for an optionless variant);
  `Product.updatedAt` from `createdAt`, the only timestamp the Storefront API
  exposes; and `Image.width`/`height` from the width images are requested at
  (1080), since the API returns no dimensions — treat them as hints, not
  measurements. A product with no variant rows gets one synthetic default
  variant so `variants[0]` is always addressable.
- **Sorting.** Neutral `ProductSortKey`s map to `SearchProductsSortInput` for
  search and `CategoryProductSort` for category listings — relevance is
  `RELEVANCE` in one and `DEFAULT` (the category's own merchandised order) in
  the other. `created-at` only has a newest-first enum, so `reverse: false`
  still sorts newest first.
- **Page size.** Listings request 50 products, BigCommerce's connection maximum.
  There is no cursor pagination in the core contract.

### Menus

BigCommerce has no menu resource, so two handles are served from the closest
equivalents, and any other handle returns `[]`:

- `"header"` (or `"next-js-frontend-header-menu"`) — top-level categories,
  linking to `/search/<slug>`.
- `"footer"` (or `"next-js-frontend-footer-menu"`) — navigation-visible web
  pages, linking to `/<slug>`. The blog index is skipped; it needs its own
  rendering.

Two collection handles are shimmed the same way, for templates ported from
Next.js Commerce: `hidden-homepage-carousel` serves the store's newest products
and `hidden-homepage-featured-items` its featured products.

### Errors

Transport failures, non-2xx responses and GraphQL `errors` all become
`CommerceApiError` with `provider: "bigcommerce"` and the HTTP status (`0` when
the request never reached BigCommerce). Both tokens are redacted from any
message that would contain them.

## Agent tools

`@corte-so/commerce-bigcommerce/agent` implements
[`CommerceAgentBackend`](../commerce-agent-tools) so an AI agent can read and
edit the store through the same five tools every provider exposes:
`list_products`, `get_product`, `list_collections`, `update_product` and
`list_orders` — all five, none stubbed.

This half does not use the Storefront GraphQL API at all. Catalog reads and
writes go to BigCommerce's **v3 store management REST API** and orders to
**v2**, which is the only version that has them.

### Credentials

```ts
import {
  createBigCommerceAdminClient,
  createBigCommerceAgentBackend,
} from "@corte-so/commerce-bigcommerce/agent";
import { createCommerceAgentTools } from "@corte-so/commerce-agent-tools";

const backend = createBigCommerceAgentBackend(
  createBigCommerceAdminClient({
    storeHash: "abc123",
    accessToken: "…",                          // store-level API account token
    storefrontUrl: "https://store.example.com", // optional; for externalUrl
    currencyCode: "USD",                        // optional; labels catalog prices
  }),
);

for (const tool of createCommerceAgentTools(backend)) {
  register({
    name: `${backend.providerId}_${tool.verb}`, // "bigcommerce_list_products"
    description: tool.description,
    inputSchema: tool.inputSchema,
    handler: tool.execute,
    readOnly: tool.access === "read",
  });
}
```

Or `bigCommerceAdminClientFromEnv()`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `BIGCOMMERCE_STORE_HASH` | yes | Store hash, e.g. `abc123` |
| `BIGCOMMERCE_ACCESS_TOKEN` | yes | Store-level API account token, sent as `X-Auth-Token` |
| `BIGCOMMERCE_STOREFRONT_URL` | no | Public storefront origin, for `externalUrl` |
| `BIGCOMMERCE_CURRENCY_CODE` | no | Currency to label catalog prices with |
| `BIGCOMMERCE_API_URL` | no | Override the management API host |

`BIGCOMMERCE_ACCESS_TOKEN` is **not** the storefront token the catalog provider
uses. Mint it at **Settings → API → API accounts** with *Products* read/write
and *Orders* read scopes (the same variable the catalog provider reads for
checkout URLs, which additionally wants *Carts*). It is server-only, must never
reach a browser, and is redacted from every error this package throws.

### Mapping notes

- **Sorting.** Core's sort keys map onto `/v3/catalog/products?sort=&direction=`:
  `created-at` → `date_created`, `price` → `price`, `best-selling` →
  `total_sold`. Each has a natural base direction that `reverse` flips — price
  ascends by default (cheapest first), `created-at` ascends (so `reverse: true`
  reads newest first), `total_sold` descends (most sold first). `relevance` has
  no v3 equivalent: no `sort` is sent, leaving BigCommerce's own ordering, which
  with a `keyword` is its relevance ranking.
- **Tags are `search_keywords`.** BigCommerce has no tag primitive; the
  merchandising keyword list is the closest equivalent and is what
  `list_products`/`get_product` read and `update_product` writes (comma-joined).
  Note this is **a different field from `Product.tags` on the catalog provider**,
  which reports SEO meta keywords because that is the only keyword field the
  Storefront GraphQL API exposes. Tags set through the agent will not appear
  there — including `corte-frontend-hidden`, which therefore does not hide a
  product from storefront listings when set this way.
- **Currency.** v3 catalog prices are bare numbers in the store's default
  currency with no code attached, so `currencyCode` has to be configured; unset,
  catalog money reports an empty `currencyCode` rather than a guess. Orders are
  unaffected — v2 orders carry their own `currency_code`.
- **Handles.** `get_product` takes a numeric product id directly. Anything else
  is treated as a storefront slug, which v3 cannot filter on: it is searched as
  free text (`?keyword=`, hyphens read as word breaks) and only an exact
  `custom_url` slug match is returned, so a near miss reports `null` rather than
  the wrong product. `update_product` requires the numeric id and rejects a
  handle.
- **Merchandise ids.** Variants are reported as `productEntityId:variantEntityId`
  — the same composite id the catalog provider hands out, so an agent-surfaced
  variant can go straight into `cart.addToCart`. A product with no variant rows
  reports one synthetic `Default Title` variant addressed by bare product id.
- **Availability.** A product is available when it is visible, not `disabled`,
  and — where it tracks inventory — has stock at the level it tracks it
  (`product` or `variant`). A variant is available when purchasing is not
  disabled and its own stock allows it.
- **Descriptions** are BigCommerce's HTML reduced to plain text, since the
  result is read by a model in a chat context. `update_product` writes the
  `description` string through unchanged, HTML and all.
- **SEO** maps to `page_title` / `meta_description`; **visibility** to
  `is_visible`. An update naming no fields performs no write and just reads the
  product back. Every update re-reads the product in full, because the `PUT`
  response omits variants, images and options.
- **Collections** are v3 categories (one page of 50), with the real storefront
  path from `custom_url` — not the catalog provider's `/search/<handle>` route.
  No `productCount`: the categories endpoint does not report one.
- **Orders.** `completed` and `canceled` filter server-side on `status_id` 10
  and 5. `open` spans several statuses and v2 filters one at a time, so it is
  resolved client-side over a wider page (3× the limit, capped at 250),
  excluding Incomplete, Refunded, Cancelled, Declined and Completed. BigCommerce's
  order id *is* the merchant-facing order number, so no separate `number` is
  reported; `createdAt` is v2's RFC-2822 date converted to ISO-8601; `lineCount`
  is `items_total`, a quantity total rather than a distinct-line count; and
  `lineSummary` is omitted, since v2 needs a second request per order to read
  line items.

## Tests

```bash
npx vitest run packages/commerce-bigcommerce     # unit tests, fake fetch, no credentials

COMMERCE_INTEGRATION=1 \
BIGCOMMERCE_STORE_HASH=… BIGCOMMERCE_CUSTOMER_IMPERSONATION_TOKEN=… \
  npx vitest run packages/commerce-bigcommerce   # + live read-only checks
```

The agent-tools integration suite is separate and needs the management-API
credential instead; it skips itself when that is absent, and only reads:

```bash
COMMERCE_INTEGRATION=1 \
BIGCOMMERCE_STORE_HASH=… BIGCOMMERCE_ACCESS_TOKEN=… \
  npx vitest run packages/commerce-bigcommerce
```
