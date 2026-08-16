import { pageContentFragment } from "../fragments/page.js";

// The concrete page types all carry body/summary; `BlogIndexPage` only has a
// path, so it is spread separately.
const pageBodySelection = /* GraphQL */ `
  ... on NormalPage {
    plainTextSummary(characterLimit: 240)
    htmlBody
    path
  }
  ... on ContactPage {
    plainTextSummary(characterLimit: 240)
    htmlBody
    path
  }
  ... on RawHtmlPage {
    plainTextSummary(characterLimit: 240)
    htmlBody
    path
  }
  ... on BlogIndexPage {
    path
  }
`;

export const getPageQuery = /* GraphQL */ `
  query getPage($entityId: Int!) {
    site {
      content {
        page(entityId: $entityId) {
          ...pageContent
          ${pageBodySelection}
        }
      }
    }
  }
  ${pageContentFragment}
`;

export const getPagesQuery = /* GraphQL */ `
  query getPages {
    site {
      content {
        pages {
          edges {
            node {
              ...pageContent
              ${pageBodySelection}
            }
          }
        }
      }
    }
  }
  ${pageContentFragment}
`;
