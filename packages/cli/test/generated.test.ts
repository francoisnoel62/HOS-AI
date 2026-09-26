import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { generate } from "../scripts/corpus.ts";

// The CLI embeds the conformance scenarios of public/spec/0.1/conformance. After changing a published scenario, run
// npm run generate -w @hos-ai/cli.

describe("generated files", () => {
  it.each(Object.entries(generate()))("%s matches the published scenarios", (file, content) => {
    const committed = readFileSync(new URL(`../${file}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
    expect(committed === content, `${file} is out of date: run npm run generate -w @hos-ai/cli`).toBe(true);
  });
});
