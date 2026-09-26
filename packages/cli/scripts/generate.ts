import { writeFileSync } from "node:fs";

import { generate } from "./corpus.ts";

// Writes the files derived from public/spec/0.1. A test fails until they match what corpus.ts produces.

for (const [file, content] of Object.entries(generate())) {
  writeFileSync(new URL(`../${file}`, import.meta.url), content);
  console.log(`Wrote ${file}`);
}
