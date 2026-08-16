# @corte-so/commerce-squarespace

A **catalog-only** Squarespace provider for the
[`@corte-so/commerce-core`](../commerce-core) contract. It reads a Squarespace
store's products through the official Squarespace Commerce API
(`https://api.squarespace.com/1.0/commerce/products`) and maps them onto the
core `Product` / `Collection` types.

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
with **Read** access; nothing else is needed. Copy the key at creation time —
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

## Errors

Failed API calls throw core's `CommerceApiError` with `provider: "squarespace"`
and the HTTP status. The API key never appears in an error message. A 404 from
a product lookup resolves to `null` rather than throwing.

## Tests

```sh
npx vitest run packages/commerce-squarespace          # unit tests, fixtures only
COMMERCE_INTEGRATION=1 SQUARESPACE_API_TOKEN=… npx vitest run packages/commerce-squarespace
```

The integration suite is read-only and self-skips when
`SQUARESPACE_API_TOKEN` is absent.
