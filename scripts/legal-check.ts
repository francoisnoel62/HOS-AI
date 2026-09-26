import { pendingLegalFields } from "../lib/legal";

// Release gate: lists every publisher detail still marked "To complete" in lib/legal.ts.
const open = pendingLegalFields();
if (open.length) {
  console.error(`${open.length} legal detail(s) still to complete in lib/legal.ts:`);
  for (const label of open) console.error(`- ${label}`);
  process.exit(1);
}
console.log("Every legal detail is complete.");
