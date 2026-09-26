// A fake implementation that forgets deduplication: it answers like the reference projection, except that it applies a
// redelivered fact instead of discarding it as a duplicate.
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
  const disposition = step.disposition === "duplicate" ? "applied" : step.disposition;
  console.log(JSON.stringify({ delivery: deliveries[index].delivery, disposition, stays, situations: step.emitted }));
}
