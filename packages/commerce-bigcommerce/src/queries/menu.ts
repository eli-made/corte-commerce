// BigCommerce has no menu resource: the category tree is the header menu and
// navigation-visible web pages are the footer menu.
export const getMenuQuery = /* GraphQL */ `
  query getMenu {
    site {
      categoryTree {
        ...CategoryFields
        children {
          ...CategoryFields
          children {
            ...CategoryFields
          }
        }
      }
    }
  }
  fragment CategoryFields on CategoryTreeItem {
    hasChildren
    entityId
    name
    path
  }
`;
