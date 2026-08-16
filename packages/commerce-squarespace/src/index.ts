export {
  createSquarespaceProvider,
  squarespaceProviderFromEnv,
} from "./provider.js";
export type { SquarespaceProviderConfig } from "./provider.js";

export { defaultSort, sorting } from "./sorting.js";

export {
  API_KEY_ENV,
  MAX_PRODUCT_PAGES,
  PROVIDER_ID,
  STORE_DOMAIN_ENV,
} from "./constants.js";

export type {
  SquarespacePagination,
  SquarespacePrice,
  SquarespaceProduct,
  SquarespaceProductImage,
  SquarespaceProductVariant,
  SquarespaceProductsResponse,
} from "./types.js";
