import { productFragment } from "../fragments/product.js";

export const getProductQuery = /* GraphQL */ `
  query getProduct($entityId: Int!) {
    site {
      product(entityId: $entityId) {
        ...product
      }
    }
  }
  ${productFragment}
`;

export const getProductsCollectionQuery = /* GraphQL */ `
  query getProductsCollection(
    $entityId: Int!
    $sortBy: CategoryProductSort
    $hideOutOfStock: Boolean
    $first: Int
  ) {
    site {
      category(entityId: $entityId) {
        products(
          sortBy: $sortBy
          hideOutOfStock: $hideOutOfStock
          first: $first
        ) {
          edges {
            node {
              ...product
            }
          }
        }
      }
    }
  }
  ${productFragment}
`;

export const searchProductsQuery = /* GraphQL */ `
  query searchProducts(
    $filters: SearchProductsFiltersInput!
    $sort: SearchProductsSortInput
    $first: Int
  ) {
    site {
      search {
        searchProducts(filters: $filters, sort: $sort) {
          products(first: $first) {
            edges {
              node {
                ...product
              }
            }
          }
        }
      }
    }
  }
  ${productFragment}
`;

// Keyed by `entityId` rather than the global `id` the upstream port used, so
// that `Product.id` is the same identifier everywhere in this package.
export const getProductRecommendationsQuery = /* GraphQL */ `
  query getProductRecommendations($entityId: Int!, $first: Int) {
    site {
      product(entityId: $entityId) {
        relatedProducts(first: $first) {
          edges {
            node {
              ...product
            }
          }
        }
      }
    }
  }
  ${productFragment}
`;

export const getNewestProductsQuery = /* GraphQL */ `
  query getNewestProducts($first: Int) {
    site {
      newestProducts(first: $first) {
        edges {
          node {
            ...product
          }
        }
      }
    }
  }
  ${productFragment}
`;

export const getFeaturedProductsQuery = /* GraphQL */ `
  query getFeaturedProducts($first: Int) {
    site {
      featuredProducts(first: $first) {
        edges {
          node {
            ...product
          }
        }
      }
    }
  }
  ${productFragment}
`;
