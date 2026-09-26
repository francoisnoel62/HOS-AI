import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  // The SDK core runs in a browser as well as in Node: only @hos-ai/sdk/node may use Node's APIs.
  {
    files: ["packages/sdk/src/**/*.ts"],
    ignores: ["packages/sdk/src/node/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ regex: "^node:", message: "Node APIs belong in packages/sdk/src/node." }] }],
      "no-restricted-globals": ["error", "process", "Buffer", "require", "__dirname", "__filename"],
    },
  },
  globalIgnores([".next/**", "node_modules/**", "coverage/**", "playwright-report/**", "packages/*/dist/**"]),
]);
