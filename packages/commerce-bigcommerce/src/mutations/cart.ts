import { cartFragments, cartSelection } from "../fragments/cart.js";

export const createCartMutation = /* GraphQL */ `
  mutation createCart($createCartInput: CreateCartInput!) {
    cart {
      createCart(input: $createCartInput) {
        cart {
          ${cartSelection}
        }
      }
    }
  }
  ${cartFragments}
`;

export const addCartLineItemsMutation = /* GraphQL */ `
  mutation addCartLineItems($addCartLineItemsInput: AddCartLineItemsInput!) {
    cart {
      addCartLineItems(input: $addCartLineItemsInput) {
        cart {
          ${cartSelection}
        }
      }
    }
  }
  ${cartFragments}
`;

export const updateCartLineItemMutation = /* GraphQL */ `
  mutation updateCartLineItem(
    $updateCartLineItemInput: UpdateCartLineItemInput!
  ) {
    cart {
      updateCartLineItem(input: $updateCartLineItemInput) {
        cart {
          ${cartSelection}
        }
      }
    }
  }
  ${cartFragments}
`;

export const deleteCartLineItemMutation = /* GraphQL */ `
  mutation deleteCartLineItem(
    $deleteCartLineItemInput: DeleteCartLineItemInput!
  ) {
    cart {
      deleteCartLineItem(input: $deleteCartLineItemInput) {
        deletedLineItemEntityId
        deletedCartEntityId
        cart {
          ${cartSelection}
        }
      }
    }
  }
  ${cartFragments}
`;

// Returns the hosted checkout URL for a cart. This is the credential-free
// path to `Cart.checkoutUrl`; `resolveCheckoutUrl` in provider.ts calls the
// v3 REST equivalent instead when a store-level access token is configured.
export const createCartRedirectUrlsMutation = /* GraphQL */ `
  mutation createCartRedirectUrls($input: CreateCartRedirectUrlsInput!) {
    cart {
      createCartRedirectUrls(input: $input) {
        redirectUrls {
          redirectedCheckoutUrl
          embeddedCheckoutUrl
          cartUrl
        }
      }
    }
  }
`;
