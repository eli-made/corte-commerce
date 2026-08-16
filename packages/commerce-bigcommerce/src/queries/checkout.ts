// A BigCommerce cart carries only its own `amount`; subtotal, tax and grand
// total live on the checkout that shares the cart's entity id.
export const getCheckoutQuery = /* GraphQL */ `
  query getCheckout($entityId: String!) {
    site {
      checkout(entityId: $entityId) {
        subtotal {
          currencyCode
          value
        }
        taxTotal {
          currencyCode
          value
        }
        grandTotal {
          currencyCode
          value
        }
      }
    }
  }
`;
