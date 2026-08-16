import { cartFragments, cartSelection } from "../fragments/cart.js";

export const getCartQuery = /* GraphQL */ `
  query getCart($entityId: String!) {
    site {
      cart(entityId: $entityId) {
        ${cartSelection}
      }
    }
  }
  ${cartFragments}
`;
