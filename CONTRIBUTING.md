# Contributing

## Workflow

Work happens on branches and lands via pull request — `main` is never pushed
directly. CI (build, tests, typecheck) runs secret-free on every PR, so fork
PRs are welcome.

```sh
npm install
npm test
npm run typecheck
```

## Changesets: versioning & changelogs

Every PR that changes a published package includes a changeset:

```sh
npx changeset
```

Pick the packages you touched, the bump type, and write the changelog entry a
consumer would want to read (what changed and why it matters to them — not the
commit message). Docs-only and test-only changes don't need one.

On merge to `main`, the release workflow opens (or updates) a **Version
Packages** PR that applies pending bumps and writes `CHANGELOG.md`s. Merging
that PR publishes the new versions to npm. Nothing publishes without that
second merge.

Semver policy: `@corte-so/commerce-core` is the contract — breaking changes to
its types are major bumps and should be rare and batched. Provider packages
follow their own cadence.

## Adding a provider

1. `packages/commerce-<name>/` with the same layout as an existing provider
   (`provider.ts`, `fetch.ts`, `mappers.ts`, wire `types.ts`, README).
2. Implement `CommerceProvider` from `@corte-so/commerce-core`. Catalog
   methods are mandatory; everything else is optional and mirrored by a
   capability flag.
3. Declare capabilities honestly — only for operations built on documented,
   supported provider APIs. Call `assertProviderShape` in your tests.
4. Map native shapes onto the core domain model in your mapper layer
   (`Money` = decimal string + ISO 4217, never cents).
5. Config is injected via the constructor; add a `<name>ProviderFromEnv()`
   convenience using `requireConfig`, and document the exact env var names in
   the package README.
6. Unit tests run against fixtures with an injected `fetch` — no credentials.
   Live checks go in `src/integration/` behind `describe.skipIf` on the
   relevant env vars; they only run under `COMMERCE_INTEGRATION=1`.

## Conventions

- TypeScript strict ESM; relative imports use explicit `.js` extensions.
- No `process.env` reads at module scope, anywhere.
- Never put credentials in error messages, logs, or fixtures.
