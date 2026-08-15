/** Base class for all errors thrown by @corte-so/commerce-* packages. */
export class CommerceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** A provider API call failed. Carries enough to log/retry without leaking
 * credentials — never put tokens or full request bodies in `message`. */
export class CommerceApiError extends CommerceError {
  readonly status: number;
  readonly provider: string;

  constructor(provider: string, status: number, message: string) {
    super(`[${provider}] ${message}`);
    this.provider = provider;
    this.status = status;
  }
}

/** Required configuration (env var / constructor option) is missing. */
export class CommerceConfigError extends CommerceError {}

/**
 * Read a required config value from an env-like record. Providers use this in
 * their `fromEnv()` conveniences so a missing variable fails with the exact
 * key name instead of a downstream `Bearer undefined` request.
 */
export function requireConfig(
  env: Record<string, string | undefined>,
  key: string,
): string {
  const value = env[key];
  if (value === undefined || value === "") {
    throw new CommerceConfigError(`Missing required configuration: ${key}`);
  }
  return value;
}
