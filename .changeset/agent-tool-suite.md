---
"@corte-so/commerce-shopify": minor
"@corte-so/commerce-squarespace": minor
"@corte-so/commerce-bigcommerce": minor
---

Add the `/agent` subpath: an admin-API client and a `CommerceAgentBackend`
powering the `@corte-so/commerce-agent-tools` suite (`list_products`,
`get_product`, `list_collections`, `update_product`, `list_orders`).
Shopify uses the Admin GraphQL API (`SHOPIFY_ADMIN_ACCESS_TOKEN`), BigCommerce
the v3/v2 REST APIs (`BIGCOMMERCE_ACCESS_TOKEN`), and Squarespace the same
official API key as the catalog side — including product updates via the
documented Products API v2 and read-only order listing via the Orders API.
