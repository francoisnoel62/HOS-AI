import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

// The site uses the workspace packages from their sources, as tsconfig.json maps them, so it never needs their build.
const sdkSources = fileURLToPath(new URL("./packages/sdk/src/", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@hos-ai\/sdk$/, replacement: `${sdkSources}index.ts` },
      { find: /^@hos-ai\/sdk\/(.+)$/, replacement: `${sdkSources}$1/index.ts` },
      { find: "@", replacement: fileURLToPath(new URL("./", import.meta.url)) },
    ],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "site",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./tests/setup.ts"],
          include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
        },
      },
      "packages/*/vitest.config.ts",
    ],
  },
});
