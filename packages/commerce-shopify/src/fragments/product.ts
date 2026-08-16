import { imageFragment } from "./image.js";
import { seoFragment } from "./seo.js";

export const productFragment = /* GraphQL */ `
  fragment product on Product {
    id
    handle
    availableForSale
    title
    description
    descriptionHtml
    options {
      id
      name
      values
    }
    priceRange {
      maxVariantPrice {
        amount
        currencyCode
      }
      minVariantPrice {
        amount
        currencyCode
      }
    }
    variants(first: 250) {
      edges {
        node {
          id
          title
          availableForSale
          selectedOptions {
            name
            value
          }
          price {
            amount
            currencyCode
          }
        }
      }
    }
    featuredImage {
      ...image
    }
    images(first: 20) {
      edges {
        node {
          ...image
        }
      }
    }
    seo {
      ...seo
    }
    tags
    updatedAt
  }
  ${imageFragment}
  ${seoFragment}
`;

/**
 * Cart lines only ever surface `CartProduct` (id/handle/title/image), so the
 * cart documents select that instead of the full product fragment — upstream
 * Next.js Commerce fetches an entire product per line and throws most of it
 * away.
 */
export const cartProductFragment = /* GraphQL */ `
  fragment cartProduct on Product {
    id
    handle
    title
    featuredImage {
      ...image
    }
  }
  ${imageFragment}
`;
