import { CommerceApiError } from "@corte-so/commerce-core";
import { API_ORIGIN, PROVIDER_ID } from "./constants.js";

export type FetchLike = typeof fetch;

export type SquarespaceClientOptions = {
  apiKey: string;
  fetch?: FetchLike;
};

/**
 * Thin client over the Squarespace Commerce API. The API key is captured in
 * the closure and only ever leaves through the `Authorization` header — it is
 * never interpolated into an error message or a URL.
 */
export type SquarespaceClient = {
  get<T>(pathname: string, query?: Record<string, string>): Promise<T>;
  /** Like `get`, but resolves to `null` on 404 instead of throwing. */
  getOrNull<T>(pathname: string, query?: Record<string, string>): Promise<T | null>;
};

async function readErrorMessage(response: Response): Promise<string> {
  // Squarespace error bodies look like { type, subtype, message, contextId }.
  // Fall back to the status line when the body is empty or not JSON.
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return response.statusText || `HTTP ${response.status}`;
  }
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return response.statusText || `HTTP ${response.status}`;
}

export function createSquarespaceClient({
  apiKey,
  fetch: fetchImpl,
}: SquarespaceClientOptions): SquarespaceClient {
  if (typeof (fetchImpl ?? globalThis.fetch) !== "function") {
    throw new TypeError(
      "No fetch implementation available — pass `fetch` in the provider config.",
    );
  }
  // Bind the global so runtimes that check the receiver stay happy.
  const doFetch: FetchLike = fetchImpl ?? globalThis.fetch.bind(globalThis);

  const request = async (
    pathname: string,
    query?: Record<string, string>,
  ): Promise<Response> => {
    const url = new URL(pathname, API_ORIGIN);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }
    return doFetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": "corte-commerce-squarespace",
        Accept: "application/json",
      },
    });
  };

  const parse = async <T>(response: Response, pathname: string): Promise<T> => {
    try {
      return (await response.json()) as T;
    } catch {
      throw new CommerceApiError(
        PROVIDER_ID,
        response.status,
        `Malformed JSON response from ${pathname}`,
      );
    }
  };

  return {
    async get<T>(pathname: string, query?: Record<string, string>): Promise<T> {
      const response = await request(pathname, query);
      if (!response.ok) {
        throw new CommerceApiError(
          PROVIDER_ID,
          response.status,
          `GET ${pathname} failed: ${await readErrorMessage(response)}`,
        );
      }
      return parse<T>(response, pathname);
    },

    async getOrNull<T>(
      pathname: string,
      query?: Record<string, string>,
    ): Promise<T | null> {
      const response = await request(pathname, query);
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new CommerceApiError(
          PROVIDER_ID,
          response.status,
          `GET ${pathname} failed: ${await readErrorMessage(response)}`,
        );
      }
      return parse<T>(response, pathname);
    },
  };
}
