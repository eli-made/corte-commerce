// Cart line selections. Only the fields the core `CartItem` / `CartProduct`
// shape needs are requested — line items already carry the product name,
// image and URL, so mapping a cart never has to re-fetch the catalog.

const physicalItemFragment = /* GraphQL */ `
  fragment physicalItem on CartPhysicalItem {
    entityId
    parentEntityId
    productEntityId
    variantEntityId
    sku
    name
    url
    imageUrl
    brand
    quantity
    isTaxable
    listPrice {
      ...CartMoneyFields
    }
    extendedListPrice {
      ...CartMoneyFields
    }
    extendedSalePrice {
      ...CartMoneyFields
    }
    isShippingRequired
    selectedOptions {
      ...CartSelectedOptionFields
    }
  }
`;

const digitalItemFragment = /* GraphQL */ `
  fragment digitalItem on CartDigitalItem {
    entityId
    parentEntityId
    productEntityId
    variantEntityId
    sku
    name
    url
    imageUrl
    brand
    quantity
    isTaxable
    listPrice {
      ...CartMoneyFields
    }
    extendedListPrice {
      ...CartMoneyFields
    }
    extendedSalePrice {
      ...CartMoneyFields
    }
    selectedOptions {
      ...CartSelectedOptionFields
    }
  }
`;

const customItemFragment = /* GraphQL */ `
  fragment customItem on CartCustomItem {
    entityId
    sku
    name
    quantity
    listPrice {
      ...CartMoneyFields
    }
    extendedListPrice {
      ...CartMoneyFields
    }
  }
`;

/** Shared leaf fragments referenced by all three line-item fragments. */
const cartSharedFragments = /* GraphQL */ `
  fragment CartMoneyFields on Money {
    currencyCode
    value
  }
  fragment CartSelectedOptionFields on CartSelectedOption {
    entityId
    name
    ... on CartSelectedCheckboxOption {
      value
    }
    ... on CartSelectedDateFieldOption {
      date {
        utc
      }
    }
    ... on CartSelectedFileUploadOption {
      fileName
    }
    ... on CartSelectedMultiLineTextFieldOption {
      text
    }
    ... on CartSelectedMultipleChoiceOption {
      value
    }
    ... on CartSelectedNumberFieldOption {
      number
    }
    ... on CartSelectedTextFieldOption {
      text
    }
  }
`;

/** Every cart document ends with this block. */
const cartFragments = `
  ${physicalItemFragment}
  ${digitalItemFragment}
  ${customItemFragment}
  ${cartSharedFragments}
`;

/** The `lineItems` selection shared by the cart query and every cart mutation. */
const cartLineItemsSelection = /* GraphQL */ `
  lineItems {
    totalQuantity
    physicalItems {
      ...physicalItem
    }
    digitalItems {
      ...digitalItem
    }
    customItems {
      ...customItem
    }
  }
`;

/** The full cart selection shared by the cart query and every cart mutation. */
const cartSelection = /* GraphQL */ `
  entityId
  currencyCode
  isTaxIncluded
  amount {
    ...CartMoneyFields
  }
  ${cartLineItemsSelection}
`;

export {
  cartFragments,
  cartLineItemsSelection,
  cartSelection,
  cartSharedFragments,
  customItemFragment,
  digitalItemFragment,
  physicalItemFragment,
};
