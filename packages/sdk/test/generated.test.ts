import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { generate } from "../scripts/codegen.ts";

// The embedded schemas, the types and the typed examples are generated from public/spec/0.1. After changing a published
// schema or example, run npm run generate -w @hos-ai/sdk.

describe("generated files", () => {
  it.each(Object.entries(generate()))("%s matches the published artefacts", (file, content) => {
    const committed = readFileSync(new URL(`../${file}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
    expect(committed === content, `${file} is out of date: run npm run generate -w @hos-ai/sdk`).toBe(true);
  });
});
