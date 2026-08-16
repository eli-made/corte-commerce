import type {
  WebhookClassification,
  WebhookOperations,
} from "@corte-so/commerce-core";

const COLLECTION_TOPICS = [
  "collections/create",
  "collections/delete",
  "collections/update",
];

const PRODUCT_TOPICS = ["products/create", "products/delete", "products/update"];

/** Header names arrive with whatever casing the host framework used. */
function headerValue(
  headers: Record<string, string | null | undefined>,
  name: string,
): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value ?? undefined;
  }
  return undefined;
}

/**
 * Shopify's revalidation webhook, minus the framework. Upstream's route always
 * answers 200 so Shopify stops retrying; that response is the host's job now —
 * this only decides *what changed*.
 */
export function createShopifyWebhooks(revalidationSecret?: string): WebhookOperations {
  return {
    classify({ headers, searchParams }): WebhookClassification | null {
      // No configured secret means the endpoint is unauthenticated; refuse
      // rather than let anyone trigger cache invalidation.
      if (!revalidationSecret) return null;

      const secret = searchParams?.get("secret");
      if (!secret || secret !== revalidationSecret) return null;

      const topic = headerValue(headers, "x-shopify-topic") ?? "unknown";
      if (COLLECTION_TOPICS.includes(topic)) return { scope: "collections" };
      if (PRODUCT_TOPICS.includes(topic)) return { scope: "products" };
      return null;
    },
  };
}
