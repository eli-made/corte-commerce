# @corte-so/commerce-squarespace

A **catalog-only** Squarespace provider for the
[`@corte-so/commerce-core`](../commerce-core) contract. It reads a Squarespace
store's products through the official Squarespace Commerce API
(`https://api.squarespace.com/1.0/commerce/products`) and maps them onto the
core `Product` / `Collection` types.

The [`/agent`](#agent-tools) subpath adds the merchant-side half: a
`CommerceAgentBackend` for [`@corte-so/commerce-agent-tools`](../commerce-agent-tools),
over the same API and the same API key.

## Capabilities

| Capability | Supported | Why |
| --- | --- | --- |
| Catalog (`getProduct`, `getProducts`, `getCollection`, `getCollections`, `getCollectionProducts`) | ✅ | Squarespace's Commerce API exposes products. |
| `cart` | ❌ | No cart resource is offered. |
| `checkout` | ❌ | No checkout resource is offered. |
| `search` | ❌ | `getProducts({ query })` filters the fetched catalog client-side; there is no server-side product search to declare. |
| `pages` | ❌ | Not part of the Commerce API. |
| `menus` | ❌ | Not part of the Commerce API. |
| `recommendations` | ❌ | Not part of the Commerce API. |
| `webhooks` | ❌ | No commerce revalidation hooks are wired up. |

**What this means for a storefront.** Squarespace's supported commerce surface
covers browsing, not buying: there is no API for building a cart or starting a
checkout. So a Squarespace-backed storefront should render browse-only — no
cart drawer, no add-to-cart button — and send shoppers to the merchant's own
Squarespace store to purchase. Every product carries `externalUrl` for exactly
that: a "View on store" link. Capability flags are honest promises, and these
say what the API can actually back.

## Install

```sh
npm install @corte-so/commerce-squarespace
```

## Configuration

```ts
import { createSquarespaceProvider } from "@corte-so/commerce-squarespace";

const provider = createSquarespaceProvider({
  apiKey: process.env.SQUARESPACE_API_TOKEN!,
  storeDomain: "shop.example.com", // optional
  // fetch: customFetch,           // optional (tests, non-global-fetch runtimes)
});
```

or from the environment:

```ts
import { squarespaceProviderFromEnv } from "@corte-so/commerce-squarespace";

const provider = squarespaceProviderFromEnv(); // reads process.env when present
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `SQUARESPACE_API_TOKEN` | yes | Squarespace API key with the **Products** (read) scope. |
| `SQUARESPACE_STORE_DOMAIN` | no | Merchant storefront domain, e.g. `shop.example.com`. Used **only** to absolutize `Product.externalUrl` when the API returns a site-relative product path. |

Environment variables are read when you call `squarespaceProviderFromEnv()`,
never at module load, and a missing key fails immediately by name
(`CommerceConfigError`) instead of producing an unauthenticated request.

### Minting an API key

In the Squarespace site owner's account: **Settings → Developer tools → API
keys → Generate key**. Give the key a name and grant the **Products** permission
with **Read** access; nothing else is needed for the catalog provider (the
[agent tools](#agent-tools) need more, and permissions cannot be changed after
the key is minted). Copy the key at creation time —
Squarespace shows it once — and store it server-side only. API keys are
available on Squarespace Business and Commerce plans.

## Usage

```ts
const products = await provider.getProducts({ sortKey: "price" });
const shirt = await provider.getProduct(products[0].handle);

const collections = await provider.getCollections();
const summer = await provider.getCollectionProducts({ collection: "summer" });

if (!provider.capabilities.cart) {
  // Render "View on store" using product.externalUrl instead of add-to-cart.
}
```

## Behavior worth knowing

- **Handles are product ids.** Squarespace has no storefront handle for a
  product (`urlSlug` is unique only within a store page), so `Product.handle`
  is the product id and `getProduct(handle)` looks products up by id. Routes
  built from handles therefore carry ids.
- **Collections come from tags.** The Commerce API has no collection resource,
  so each product tag becomes a pseudo-collection with path
  `/search/<tag>`, and `getCollectionProducts` filters by that tag. Tags
  beginning with `hidden` are skipped, and products tagged
  `corte-frontend-hidden` (core's `HIDDEN_PRODUCT_TAG`) are dropped from all
  listings.
- **Pagination is followed to the end.** `getProducts` walks
  `pagination.nextPageCursor` until the API reports no next page, capped at
  **50 pages** (`MAX_PRODUCT_PAGES`, ~2,500 products) so a repeating or
  runaway cursor can't loop forever. Catalogs larger than the cap need a
  provider with real server-side paging and search.
- **Query and sorting are client-side.** `query` matches a lowercased
  substring of the product name; `price` sorts on the lowest effective
  (sale-aware) variant price and `created-at` on `createdOn`. `relevance` and
  `best-selling` keep the API's own order. This is why `search` is `false`.
- **Money keeps the API's currency.** Prices arrive as decimal strings in
  major units with their own ISO currency code, and are passed through as
  `Money` unchanged — no hardcoded `USD`, no cent arithmetic.
- **Availability is sale- and stock-aware.** A variant is available when its
  stock is unlimited or its quantity is above zero; a product is available
  when it is visible and at least one variant is available.
- **No caching.** Every call hits the API. Wrap the provider in your
  framework's cache (e.g. `@corte-so/commerce-next`) if you need one.

## Agent tools

`@corte-so/commerce-squarespace/agent` implements `CommerceAgentBackend`, so
`createCommerceAgentTools()` generates the same tool suite here as for any
other provider.

```ts
import { createCommerceAgentTools } from "@corte-so/commerce-agent-tools";
import {
  createSquarespaceAgentBackend,
  squarespaceAgentClientFromEnv,
} from "@corte-so/commerce-squarespace/agent";

const backend = createSquarespaceAgentBackend(squarespaceAgentClientFromEnv());
// or: createSquarespaceAgentClient({ apiKey, storeDomain, fetch })

for (const tool of createCommerceAgentTools(backend)) {
  register({
    name: `${backend.providerId}_${tool.verb}`, // squarespace_list_products, …
    inputSchema: tool.inputSchema,
    handler: tool.execute,
    readOnly: tool.access === "read",
  });
}
```

Same credential as the catalog side — `SQUARESPACE_API_TOKEN`, optionally
`SQUARESPACE_STORE_DOMAIN` — read only when you call
`squarespaceAgentClientFromEnv()`. The key is captured in the client closure;
it never appears in a tool argument, a result, or an error message.

**API key permissions.** The agent half needs more than the catalog half, and
Squarespace permissions are fixed at mint time — a key cannot be re-scoped
later, so grant these when you generate it:

| Permission | Level | Needed for |
| --- | --- | --- |
| Products | Read Only | `list_products`, `get_product`, `list_collections` |
| Products | Read and Write | `update_product` (writes; supersedes Read Only) |
| Orders | Read Only | `list_orders` |

A key without the Orders permission fails `list_orders` with a
`CommerceApiError` rather than returning an empty list.

### Which tools are generated

All five: `list_products`, `get_product`, `list_collections`,
`update_product`, `list_orders`. Nothing is omitted — every suite verb maps to
a documented Squarespace endpoint.

That is a wider surface than the storefront provider's, and deliberately so.
The storefront is browse-only because Squarespace documents no cart or
checkout API; the merchant-side APIs are a different set, and orders are part
of it — the [Orders API](https://developers.squarespace.com/commerce-apis/retrieve-all-orders)
is read-accessible with an API key, so `list_orders` is real here even though
a Squarespace storefront can't sell.

Only officially documented endpoints are used: the
[Products API](https://developers.squarespace.com/commerce-apis/products-overview)
for reads and updates, the Orders API for orders.

### Behavior worth knowing

- **The agent sees the whole catalog.** `list_products` includes products
  carrying `corte-frontend-hidden`, which the storefront drops. This is a
  merchant-side tool: an agent asked why a product isn't showing has to be
  able to see it. `list_collections`, by contrast, is derived from the
  *visible* catalog — those are storefront navigation entries, and a tag
  carried only by hidden products isn't one. It reports `productCount`, which
  is free once the catalog is in hand.
- **`update_product` uses Products API v2.** Reads stay on `1.0` (the shape
  every mapper here is written against); the update goes to
  [`POST /v2/commerce/products/{productId}`](https://developers.squarespace.com/commerce-apis/update-product),
  the version whose update body Squarespace documents. Each field is wrapped
  in the documented `{ present: true, value }` change object, and the suite's
  changes map as `title`→`name`, `description`→`description`, `tags`→`tags`
  (full replacement), `visible`→`isVisible`, `seo`→`seoData`. The updated
  product is then re-read on `1.0`, so what `update_product` returns is shaped
  by exactly the same mapper as `get_product`.
- **A partial `seo` change is merged, not applied blind.** `seoData` replaces
  the whole SEO object, so the current values are read first and only the
  fields you sent are changed — updating the SEO title alone will not blank
  the description. An update with no recognized changes performs no write.
- **Order filtering is server-side.** `status` maps onto the documented
  `fulfillmentStatus` parameter — `open`→`PENDING`, `completed`→`FULFILLED`,
  `canceled`→`CANCELED`, `any`→ no filter — and orders are reported back in
  that same vocabulary, since Squarespace tracks fulfillment rather than an
  order lifecycle. The API documents `cursor` as exclusive of the other
  parameters, so the filter goes on the first request only and the cursor
  carries it forward. Paging stops at **10 pages** (`MAX_ORDER_PAGES`) or as
  soon as the requested `limit` is met.
- **`lineCount` counts lines, not units.** An order with `2× Shirt` on one
  line has `lineCount: 1`. `lineSummary` names the first three lines and
  collapses the rest (`"2× Linen Shirt, 1× Belt, 1× Cap +2 more"`).
- **Customer names come from the order's address.** `customer.name` is the
  billing (falling back to shipping) first and last name; `customer.email` is
  `customerEmail`. Absent both, `customer` is omitted.
- **What `update_product` does not touch.** Prices, variants, images, and
  `urlSlug` are all updatable on the Squarespace side but are outside the
  suite's change set, so no tool here writes them. Orders are read-only: the
  suite has no fulfillment verb, so nothing this package generates can modify
  an order.

## Errors

Failed API calls throw core's `CommerceApiError` with `provider: "squarespace"`
and the HTTP status, reads and writes alike. The API key never appears in an
error message. A 404 from a product lookup resolves to `null` rather than
throwing; `update_product` against an unknown id throws a 404
`CommerceApiError` and performs no write.

## Tests

```sh
npx vitest run packages/commerce-squarespace          # unit tests, fixtures only
COMMERCE_INTEGRATION=1 SQUARESPACE_API_TOKEN=… npx vitest run packages/commerce-squarespace
```

Both integration suites — catalog and agent — are read-only and self-skip when
`SQUARESPACE_API_TOKEN` is absent. `update_product` is not exercised against a
live store.
