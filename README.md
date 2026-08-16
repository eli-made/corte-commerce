# corte-commerce

Composable commerce provider packages, built by [Corte](https://corte.so).
One neutral contract, one package per provider — install a provider into any
storefront, and swap providers by changing one dependency and one re-export.

| Package | What it is |
| --- | --- |
| [`@corte-so/commerce-core`](packages/commerce-core) | The contract: domain types, `CommerceProvider` interface, capability flags |
| [`@corte-so/commerce-shopify`](packages/commerce-shopify) | Shopify Storefront API provider — full capabilities |
| [`@corte-so/commerce-bigcommerce`](packages/commerce-bigcommerce) | BigCommerce Storefront GraphQL provider — full capabilities |
| [`@corte-so/commerce-squarespace`](packages/commerce-squarespace) | Squarespace Commerce API provider — catalog-only |
| [`@corte-so/commerce-next`](packages/commerce-next) | Next.js adapter: cart server-action flows, cookie helpers, webhook revalidation |

## Design

- **Framework-free providers.** Provider packages depend on `fetch` and
  nothing else. No Next imports, no ambient state, no `process.env` reads at
  module scope — config is injected (each provider ships a `fromEnv()`
  convenience). They run in Node, Cloudflare Workers, and the browser.
- **Capability flags are honest promises.** Providers differ in depth;
  pretending otherwise produces broken storefronts. A provider declares
  `cart: true` only when its cart is built on documented, supported APIs.
  UIs render against the flags — a catalog-only provider gets a browsable
  storefront with "View on store" links (`Product.externalUrl`), not a cart
  drawer that silently no-ops. `assertProviderShape` enforces that flags and
  implementations agree.
- **The domain model is Shopify-shaped by lineage** (this project descends
  from [Next.js Commerce](https://github.com/vercel/commerce)), which keeps
  existing storefront UIs drop-in compatible. Providers map their native
  shapes in a dedicated mapper layer. `Money` is decimal strings + ISO 4217,
  always.

## Switching providers

A storefront binds its provider in one file:

```ts
// lib/commerce.ts
import { shopifyProviderFromEnv } from "@corte-so/commerce-shopify";
export const commerce = shopifyProviderFromEnv();
```

Everything else imports `@/lib/commerce`. Switching to BigCommerce is a
dependency swap, a one-line change here, and new env vars — zero UI edits.

## Environment contracts

Each provider documents its exact variable names in its README:

| Provider | Required | Optional |
| --- | --- | --- |
| Shopify | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | `SHOPIFY_REVALIDATION_SECRET` |
| BigCommerce | `BIGCOMMERCE_STORE_HASH`, `BIGCOMMERCE_CUSTOMER_IMPERSONATION_TOKEN` | `BIGCOMMERCE_CHANNEL_ID`, `BIGCOMMERCE_STOREFRONT_URL` |
| Squarespace | `SQUARESPACE_API_TOKEN` | `SQUARESPACE_STORE_DOMAIN` |

`COMMERCE_PROVIDER` names the active provider for hosts that manage the
binding file automatically.

## Development

```sh
npm install
npm test                 # unit tests, no credentials needed
npm run build
npm run test:integration # hits live provider APIs; suites self-skip without creds
```

Releases are managed with [changesets](https://github.com/changesets/changesets) —
see [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

- A Medusa-backed provider (`@corte-so/commerce-medusa`) is planned.
- New providers are welcome — implement the contract, declare capabilities
  honestly, and bring fixtures. `packages/commerce-shopify` (full) and
  `packages/commerce-squarespace` (catalog-only) mark the two ends of the
  spectrum.

## License

MIT. This project descends from [Next.js Commerce](https://github.com/vercel/commerce)
and BigCommerce's [nextjs-commerce](https://github.com/bigcommerce/nextjs-commerce)
fork — see [NOTICE.md](NOTICE.md) for attribution.
