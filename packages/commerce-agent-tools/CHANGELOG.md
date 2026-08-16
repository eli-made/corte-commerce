# @corte-so/commerce-agent-tools

## 0.1.1

### Patch Changes

- [#4](https://github.com/eli-made/corte-commerce/pull/4) [`b537e33`](https://github.com/eli-made/corte-commerce/commit/b537e33d5735767c060cf75e978145000d2b09c5) Thanks [@eli-made](https://github.com/eli-made)! - Publish input-mode JSON Schemas (`z.toJSONSchema(schema, { io: "input" })`).
  Zod's default output mode marked defaulted fields (`limit`, `status`) as
  required, forcing callers to always supply them; in input mode they are
  correctly optional with a `default` annotation. Runtime behavior is unchanged
  — handlers applied the defaults all along.
