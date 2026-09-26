import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { schemas } from "../src/schemas.generated.ts";
import { readJson, specDirectory } from "./spec.ts";

// The SDK validates against an embedded copy of the published schemas. After changing a published schema, run
// npm run embed-schemas -w @hos-ai/sdk.

const published = readdirSync(path.join(specDirectory, "schemas"), { recursive: true })
  .map((file) => String(file).replaceAll("\\", "/"))
  .filter((file) => file.endsWith(".schema.json"))
  .sort();
const name = (file: string) => file.replace(/\.schema\.json$/, "");

describe("embedded schemas", () => {
  it("embed every published schema", () => {
    expect(Object.keys(schemas).sort(), "run npm run embed-schemas -w @hos-ai/sdk").toEqual(published.map(name));
  });

  it.each(published)("match the published %s", (file) => {
    expect(schemas[name(file)], "run npm run embed-schemas -w @hos-ai/sdk").toEqual(readJson(`schemas/${file}`));
  });
});
