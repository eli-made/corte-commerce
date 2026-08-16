export {
  createSquarespaceAgentClient,
  squarespaceAgentClientFromEnv,
} from "./client.js";
export type {
  SquarespaceAgentClient,
  SquarespaceAgentClientConfig,
} from "./client.js";

export { createSquarespaceAgentBackend } from "./backend.js";

export { MAX_ORDER_PAGES, ORDERS_PATH, PRODUCTS_V2_PATH } from "../constants.js";

export type {
  SquarespaceChange,
  SquarespaceFulfillmentStatus,
  SquarespaceOrder,
  SquarespaceOrderAddress,
  SquarespaceOrderLineItem,
  SquarespaceOrdersResponse,
  SquarespaceProductUpdateBody,
} from "./types.js";
