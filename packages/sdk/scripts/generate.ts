import { writeFileSync } from "node:fs";

import { generate } from "./codegen.ts";

// Writes the files derived from public/spec/0.1. A test fails until they match what codegen.ts produces.

for (const [file, content] of Object.entries(generate())) {
  writeFileSync(new URL(`../${file}`, import.meta.url), content);
  console.log(`Wrote ${file}`);
}
