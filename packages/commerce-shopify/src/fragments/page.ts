import { seoFragment } from "./seo.js";

export const pageFragment = /* GraphQL */ `
  fragment page on Page {
    id
    title
    handle
    body
    bodySummary
    seo {
      ...seo
    }
    createdAt
    updatedAt
  }
  ${seoFragment}
`;
