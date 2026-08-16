import type { CommerceProvider } from "@corte-so/commerce-core";

/** Cache tags a storefront template uses with "use cache" / cacheTag. */
export const TAGS = {
  products: "products",
  collections: "collections",
  cart: "cart",
} as const;

export type RevalidateHandlerDeps = {
  provider: CommerceProvider;
  /** Usually `revalidateTag` from "next/cache". Injected so this package
   * never imports Next. */
  revalidateTag: (tag: string) => void;
  /** Override the tag used per webhook scope. Defaults to TAGS. */
  tags?: { products: string; collections: string };
};

/**
 * Build a Route Handler for provider webhooks:
 *
 *   // app/api/revalidate/route.ts
 *   export const POST = createRevalidateHandler({ provider, revalidateTag });
 *
 * Requests the provider can't classify (wrong secret, unknown topic) are
 * dropped with a 200 so providers don't retry and probes learn nothing.
 * Providers without webhook support yield a handler that drops everything.
 */
export function createRevalidateHandler(deps: RevalidateHandlerDeps) {
  const tags = deps.tags ?? TAGS;

  return async (request: Request): Promise<Response> => {
    const classification =
      deps.provider.webhooks?.classify({
        headers: Object.fromEntries(request.headers.entries()),
        searchParams: new URL(request.url).searchParams,
        body: await request.text().catch(() => undefined),
      }) ?? null;

    if (classification) {
      deps.revalidateTag(tags[classification.scope]);
    }

    return Response.json({
      revalidated: classification !== null,
      now: Date.now(),
    });
  };
}
