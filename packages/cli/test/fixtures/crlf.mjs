// A fake implementation that answers like the reference projection, but ends its lines with CRLF, as Python's print does
// on Windows. The line endings must make no difference to its verdict.
import { replayArrivalReadiness } from "@hos-ai/sdk/reference";

let text = "";
for await (const chunk of process.stdin) text += chunk;
const lines = text
  .split("\n")
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));
const scenario = lines.find((line) => line.kind === "scenario");
const manifests = lines.filter((line) => line.kind === "manifest").map((line) => line.manifest);
const deliveries = lines.filter((line) => line.kind === "delivery");
const steps = replayArrivalReadiness(
  deliveries.map((line) => line.event),
  manifests,
  scenario.projection,
);
for (const [index, step] of steps.entries()) {
  const stays = Object.fromEntries(Object.entries(step.stays).map(([id, view]) => [id, { readiness: view.readiness, situation: view.situation }]));
  process.stdout.write(
    `${JSON.stringify({ delivery: deliveries[index].delivery, disposition: step.disposition, stays, situations: step.emitted })}\r\n`,
  );
}
