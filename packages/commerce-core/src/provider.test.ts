import { describe, expect, it } from "vitest";
import type {
  CommerceCapabilities,
  CommerceProvider,
  SortOption,
} from "./provider.js";
import { assertProviderShape } from "./provider.js";
import { CommerceConfigError, requireConfig } from "./errors.js";

const defaultSort: SortOption = {
  title: "Relevance",
  slug: null,
  sortKey: "relevance",
  reverse: false,
};

function makeProvider(
  capabilities: Partial<CommerceCapabilities>,
  extra: Partial<CommerceProvider> = {},
): CommerceProvider {
  return {
    id: "test",
    capabilities: {
      cart: false,
      checkout: false,
      search: false,
      pages: false,
      menus: false,
      recommendations: false,
      webhooks: false,
      ...capabilities,
    },
    sorting: [defaultSort],
    defaultSort,
    getProduct: async () => null,
    getProducts: async () => [],
    getCollection: async () => null,
    getCollections: async () => [],
    getCollectionProducts: async () => [],
    ...extra,
  };
}

describe("assertProviderShape", () => {
  it("accepts a catalog-only provider", () => {
    expect(() => assertProviderShape(makeProvider({}))).not.toThrow();
  });

  it("rejects a declared capability with no implementation", () => {
    expect(() => assertProviderShape(makeProvider({ cart: true }))).toThrow(
      /declares cart but does not implement it/,
    );
  });

  it("rejects an implementation with no declared capability", () => {
    const provider = makeProvider(
      {},
      {
        getMenu: async () => [],
      },
    );
    expect(() => assertProviderShape(provider)).toThrow(
      /implements menus but does not declare it/,
    );
  });

  it("rejects checkout without cart", () => {
    const provider = makeProvider({ checkout: true });
    expect(() => assertProviderShape(provider)).toThrow(
      /checkout requires a cart/,
    );
  });

  it("requires pages to implement both getPage and getPages", () => {
    const provider = makeProvider(
      { pages: true },
      {
        getPage: async () => null,
        // getPages missing
      },
    );
    expect(() => assertProviderShape(provider)).toThrow(
      /declares pages but does not implement it/,
    );
  });

  it("requires defaultSort to be a member of sorting", () => {
    const provider = makeProvider({});
    (provider as { defaultSort: SortOption }).defaultSort = {
      ...defaultSort,
    };
    expect(() => assertProviderShape(provider)).toThrow(
      /defaultSort is not one of sorting/,
    );
  });

  it("reports every violation at once", () => {
    let error: Error | undefined;
    try {
      assertProviderShape(makeProvider({ cart: true, menus: true }));
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toMatch(/declares cart/);
    expect(error?.message).toMatch(/declares menus/);
  });
});

describe("requireConfig", () => {
  it("returns the value when present", () => {
    expect(requireConfig({ KEY: "v" }, "KEY")).toBe("v");
  });

  it("throws CommerceConfigError naming the key when missing or empty", () => {
    expect(() => requireConfig({}, "SHOPIFY_STORE_DOMAIN")).toThrow(
      CommerceConfigError,
    );
    expect(() => requireConfig({ K: "" }, "K")).toThrow(/Missing required configuration: K/);
  });
});
