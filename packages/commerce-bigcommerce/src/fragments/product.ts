// Storefront GraphQL selections for catalog reads.
//
// Products are keyed by `entityId` throughout this package — the numeric id
// the Storefront API accepts everywhere (product lookup, cart mutations,
// related products). The opaque global `id` is deliberately not selected so
// there is exactly one product identity in play.

const productOptionFragment = /* GraphQL */ `
  fragment productOption on CatalogProductOption {
    __typename
    entityId
    displayName
    isRequired
    ... on MultipleChoiceOption {
      displayStyle
      values(first: 10) {
        edges {
          node {
            entityId
            isDefault
            ... on SwatchOptionValue {
              label
            }
            ... on MultipleChoiceOptionValue {
              label
            }
            ... on ProductPickListOptionValue {
              label
            }
          }
        }
      }
    }
  }
`;

const productVariantFragment = /* GraphQL */ `
  fragment productVariant on Variant {
    entityId
    sku
    isPurchasable
    prices {
      price {
        ...MoneyFields
      }
      priceRange {
        min {
          ...MoneyFields
        }
        max {
          ...MoneyFields
        }
      }
    }
    options(first: 10) {
      edges {
        node {
          entityId
          displayName
          values(first: 10) {
            edges {
              node {
                entityId
                label
              }
            }
          }
        }
      }
    }
  }
`;

const productFragment = /* GraphQL */ `
  fragment product on Product {
    entityId
    sku
    name
    brand {
      name
    }
    plainTextDescription
    description
    availabilityV2 {
      status
      description
    }
    defaultImage {
      ...ImageFields
    }
    images {
      edges {
        node {
          ...ImageFields
        }
      }
    }
    seo {
      pageTitle
      metaDescription
      metaKeywords
    }
    path
    prices {
      price {
        ...MoneyFields
      }
      priceRange {
        min {
          ...MoneyFields
        }
        max {
          ...MoneyFields
        }
      }
    }
    createdAt {
      utc
    }
    variants(first: 25) {
      edges {
        node {
          ...productVariant
        }
      }
    }
    productOptions(first: 10) {
      edges {
        node {
          ...productOption
        }
      }
    }
  }
  fragment ImageFields on Image {
    url: url(width: 1080)
    altText
  }
  fragment MoneyFields on Money {
    value
    currencyCode
  }
  ${productOptionFragment}
  ${productVariantFragment}
`;

export { productFragment, productOptionFragment, productVariantFragment };
