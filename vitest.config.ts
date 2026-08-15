import { defineConfig } from "vitest/config";

// Unit tests run everywhere with no credentials (fixtures only).
// Integration tests hit live provider APIs; they exist under each package's
// src/integration/ directory and are only picked up when COMMERCE_INTEGRATION=1
// (each suite additionally self-skips if its store credentials are absent).
const integration = process.env.COMMERCE_INTEGRATION === "1";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    exclude: integration ? [] : ["packages/*/src/integration/**"],
  },
});
