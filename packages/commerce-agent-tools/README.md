# @corte-so/commerce-agent-tools

A provider-neutral tool suite for AI agents working against a commerce store:
`list_products`, `get_product`, `list_collections`, `update_product` (write),
`list_orders`. One spec, generated per provider — so the agent experience is
identical whichever store is connected.

## Design

- **Authored in zod, published as JSON Schema.** Each tool's `inputSchema` is
  emitted with `z.toJSONSchema()` from the same schema the handler validates
  with — the published contract and the runtime validation cannot drift. Zod
  is a private implementation detail; consumers only ever see JSON.
- **Generated from a backend, honestly.** Providers implement
  `CommerceAgentBackend`; optional methods they skip cause the tool to be
  *omitted* — a store without an orders API gets no orders tool, not one that
  apologizes at runtime.
- **Closure over a client, never a credential.** Backends are built from a
  provider admin client; tokens never appear in tool arguments or results.
- **Trimmed results.** Tools return chat-sized shapes
  (`AgentProductSummary`, `AgentOrderSummary`, …), not full API payloads.

## Usage

```ts
import { createCommerceAgentTools } from "@corte-so/commerce-agent-tools";
import {
  createShopifyAdminClient,
  createShopifyAgentBackend,
} from "@corte-so/commerce-shopify/agent";

const backend = createShopifyAgentBackend(
  createShopifyAdminClient({ storeDomain, accessToken }),
);

for (const tool of createCommerceAgentTools(backend)) {
  register({
    name: `${backend.providerId}_${tool.verb}`, // naming policy is yours
    description: tool.description,
    inputSchema: tool.inputSchema,              // plain JSON Schema
    handler: tool.execute,                      // self-validating
    readOnly: tool.access === "read",
  });
}
```

Hosts own policy: tool-name prefixes, write-gating/approval flows, credential
storage, and any additional validation. This package owns behavior.

`execute` throws `CommerceError` with a readable message on invalid input
(field-level, via zod) — surface it to the model; agents self-correct well
from it.

## Adding a provider backend

Implement `CommerceAgentBackend` in your provider package under an `/agent`
subpath, mapping admin-API responses onto the `Agent*` types. Implement only
what the provider's documented APIs support. The JSON Schema snapshot test in
this package is the suite's public API record — schema changes must show up
there.
