import { mkdirSync, writeFileSync } from "node:fs";

import { generate } from "./codegen.ts";

// Writes the files derived from public/spec/0.1 and public/spec/0.2. A test fails until they match what codegen.ts produces.

for (const [file, content] of Object.entries(generate())) {
  const target = new URL(`../${file}`, import.meta.url);
  mkdirSync(new URL("./", target), { recursive: true });
  writeFileSync(target, content);
  console.log(`Wrote ${file}`);
}
