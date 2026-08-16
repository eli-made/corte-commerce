// Resolves a storefront path to the entity behind it. Used to turn a
// human-readable product or page handle back into the numeric entity id the
// rest of the Storefront API is keyed by.
export const getEntityIdByRouteQuery = /* GraphQL */ `
  query getEntityIdByRoute($path: String!) {
    site {
      route(path: $path) {
        node {
          __typename
          ... on Product {
            entityId
          }
          ... on Category {
            entityId
          }
          ... on Brand {
            entityId
          }
          ... on NormalPage {
            entityId
          }
          ... on ContactPage {
            entityId
          }
          ... on RawHtmlPage {
            entityId
          }
        }
      }
    }
  }
`;
