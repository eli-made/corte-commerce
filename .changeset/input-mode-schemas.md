---
"@corte-so/commerce-agent-tools": patch
---

Publish input-mode JSON Schemas (`z.toJSONSchema(schema, { io: "input" })`).
Zod's default output mode marked defaulted fields (`limit`, `status`) as
required, forcing callers to always supply them; in input mode they are
correctly optional with a `default` annotation. Runtime behavior is unchanged
— handlers applied the defaults all along.
