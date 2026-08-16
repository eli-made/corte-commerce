/**
 * Admin GraphQL documents backing the agent tools. They select the smallest
 * field set each `Agent*` shape needs — an agent's context window is the
 * budget, and Admin queries are cost-throttled besides.
 *
 * Media is read through `featuredMedia`/`media` rather than the deprecated
 * `featuredImage`/`images` fields, so the documents keep working as Shopify
 * retires them.
 */

const productSummaryFragment = /* GraphQL */ `
  fragment AgentProductSummary on Product {
    id
    handle
    title
    status
    tags
    updatedAt
    featuredMedia {
      preview {
        image {
          url
          altText
        }
      }
    }
    priceRangeV2 {
      minVariantPrice {
        amount
        currencyCode
      }
      maxVariantPrice {
        amount
        currencyCode
      }
    }
  }
`;

/** Variants and media are capped: a chat answer that lists 250 variants is not
 * a better answer, and the caps keep the query's calculated cost low. */
export const AGENT_VARIANT_LIMIT = 100;
export const AGENT_MEDIA_LIMIT = 20;

const productDetailFragment = /* GraphQL */ `
  ${productSummaryFragment}
  fragment AgentProductDetail on Product {
    ...AgentProductSummary
    description
    seo {
      title
      description
    }
    options {
      id
      name
      values
    }
    variants(first: ${AGENT_VARIANT_LIMIT}) {
      nodes {
        id
        title
        price
        availableForSale
      }
    }
    media(first: ${AGENT_MEDIA_LIMIT}) {
      nodes {
        ... on MediaImage {
          image {
            url
            altText
          }
        }
      }
    }
  }
`;

export const listProductsQuery = /* GraphQL */ `
  ${productSummaryFragment}
  query AgentListProducts(
    $first: Int!
    $query: String
    $sortKey: ProductSortKeys
    $reverse: Boolean
  ) {
    products(first: $first, query: $query, sortKey: $sortKey, reverse: $reverse) {
      nodes {
        ...AgentProductSummary
      }
    }
  }
`;

export const getProductQuery = /* GraphQL */ `
  ${productDetailFragment}
  query AgentGetProduct($id: ID!) {
    product(id: $id) {
      ...AgentProductDetail
    }
  }
`;

/** `productByHandle` is retired on recent Admin versions; a `handle:` search
 * is the supported way to resolve one. */
export const findProductByHandleQuery = /* GraphQL */ `
  ${productDetailFragment}
  query AgentFindProduct($query: String!) {
    products(first: 1, query: $query) {
      nodes {
        ...AgentProductDetail
      }
    }
  }
`;

export const findProductIdByHandleQuery = /* GraphQL */ `
  query AgentFindProductId($query: String!) {
    products(first: 1, query: $query) {
      nodes {
        id
      }
    }
  }
`;

export const listCollectionsQuery = /* GraphQL */ `
  query AgentListCollections($first: Int!) {
    collections(first: $first) {
      nodes {
        id
        handle
        title
        description
        productsCount {
          count
        }
      }
    }
  }
`;

export const updateProductMutation = /* GraphQL */ `
  ${productDetailFragment}
  mutation AgentUpdateProduct($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product {
        ...AgentProductDetail
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/** Newest first: the only ordering an "recent orders" question wants. */
export const listOrdersQuery = /* GraphQL */ `
  query AgentListOrders($first: Int!, $query: String, $lineItems: Int!) {
    orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        name
        createdAt
        cancelledAt
        displayFinancialStatus
        displayFulfillmentStatus
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        customer {
          displayName
          email
        }
        lineItems(first: $lineItems) {
          nodes {
            title
            quantity
          }
        }
      }
    }
  }
`;
