# @corte-so/commerce-shopify

## 0.2.0

### Minor Changes

- [#2](https://github.com/eli-made/corte-commerce/pull/2) [`ae9246e`](https://github.com/eli-made/corte-commerce/commit/ae9246e171b04728bf3b8290aecf34d1bdbf16e3) Thanks [@eli-made](https://github.com/eli-made)! - Add the `/agent` subpath: an admin-API client and a `CommerceAgentBackend`
  powering the `@corte-so/commerce-agent-tools` suite (`list_products`,
  `get_product`, `list_collections`, `update_product`, `list_orders`).
  Shopify uses the Admin GraphQL API (`SHOPIFY_ADMIN_ACCESS_TOKEN`), BigCommerce
  the v3/v2 REST APIs (`BIGCOMMERCE_ACCESS_TOKEN`), and Squarespace the same
  official API key as the catalog side — including product updates via the
  documented Products API v2 and read-only order listing via the Orders API.
