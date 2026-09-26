import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

// The CLI's tests use the SDK from its sources, so they never need its build.
const sdkSources = fileURLToPath(new URL("../sdk/src/", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@hos-ai\/sdk$/, replacement: `${sdkSources}index.ts` },
      { find: /^@hos-ai\/sdk\/(.+)$/, replacement: `${sdkSources}$1/index.ts` },
    ],
  },
  test: {
    name: "cli",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
