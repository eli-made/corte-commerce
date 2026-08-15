# @corte-so/commerce-core

The provider-neutral commerce contract: domain types (`Product`, `Cart`,
`Collection`, …), the `CommerceProvider` interface, and the capability flags
that let a storefront render honestly against providers of very different
depth.

This package has **zero dependencies, no framework imports, and no ambient
state** — it runs anywhere `fetch` does (Node, Cloudflare Workers, browsers).

## The contract

A provider implements `CommerceProvider`:

- **Catalog (mandatory):** `getProduct`, `getProducts`, `getCollection`,
  `getCollections`, `getCollectionProducts`.
- **Optional, mirrored by a capability flag:** `cart` (create/read/add/
  update/remove), `getPage`/`getPages`, `getMenu`,
  `getProductRecommendations`, `webhooks`.

```ts
import { assertProviderShape } from "@corte-so/commerce-core";

assertProviderShape(provider); // throws if flags and implementation disagree
```

Capability flags are honest promises: a provider declares `cart: true` only
when its cart operations are built on documented, supported APIs. UIs are
expected to degrade gracefully — no cart drawer for `cart: false` providers,
"View on store" links via `Product.externalUrl` instead.

## Design rules

- **Explicit identity, no ambient state.** Cart operations take `cartId` as an
  argument. Cookie persistence belongs to adapters
  (e.g. `@corte-so/commerce-next`), not providers.
- **Neutral sort vocabulary.** `ProductSortKey` is
  `relevance | best-selling | created-at | price`; providers expose only the
  `SortOption`s they support and map them to native params internally.
- **Money is decimal strings + ISO 4217.** Providers convert cent-based APIs
  in their mappers.
- **Config is injected.** Providers accept config in a constructor and offer a
  `fromEnv()` convenience built on `requireConfig`, which fails loudly with
  the missing key's name.

## Implementing a provider

1. Depend on `@corte-so/commerce-core` (a regular dependency — it's tiny).
2. Map native API shapes onto the core types in a dedicated mapper module.
3. Declare capabilities truthfully; call `assertProviderShape` in your tests.
4. Document your env contract (exact variable names) in your README.

See `@corte-so/commerce-shopify` (full capabilities) and
`@corte-so/commerce-squarespace` (catalog-only) for the two ends of the
spectrum.
