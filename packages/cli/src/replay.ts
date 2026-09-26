import { parseArgs } from "node:util";

import { type Disposition, type HosFact, type ProducerManifest, validate } from "@hos-ai/sdk";
import { replayArrivalReadiness, type StayView } from "@hos-ai/sdk/reference";

import { plural } from "./format.ts";
import { exit, type Io } from "./io.ts";

// hos replay: a recorded stream through the reference projection, delivery by delivery, to debug an adapter. It shows
// what a consumer does with each fact, how each stay's readiness changes, and the situations raised.

export const replayUsage = `Usage: hos replay <stream.jsonl> --manifest <file>... [options]

Replays a recorded stream of HOS events, one per line, through the arrival-readiness reference projection and shows
the timeline: each delivery's disposition, the stays it changes and the situations it raises.

Options:
  -m, --manifest <file>  a producer manifest; repeat it for each producer. Facts without a manifest are ignored.
      --ready <status>   a housekeeping status that makes a unit ready; repeat it (default: clean and inspected)
      --json             print the timeline as JSON
  -h, --help             show this help

Exit codes: 0 when every line replayed, 1 when a line was not a valid event and was skipped, 2 for a usage or read
error.
`;

const stayLine = (view: StayView) =>
  `${view.stay_id}: ${view.stay_status}, unit ${view.unit_id ?? "none"}, readiness ${view.readiness}, situation ${view.situation === "none" ? "none" : view.situation.replace("_", " ")}`;

export async function replayCommand(args: string[], io: Io): Promise<number> {
  let options;
  try {
    options = parseArgs({
      args,
      allowPositionals: true,
      options: {
        manifest: { type: "string", short: "m", multiple: true },
        ready: { type: "string", multiple: true },
        json: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    io.stderr(`hos replay: ${(error as Error).message}\nRun hos replay --help for usage.\n`);
    return exit.usage;
  }
  const { values, positionals } = options;
  if (values.help) {
    io.stdout(replayUsage);
    return exit.ok;
  }
  if (positionals.length !== 1) {
    io.stderr(`hos replay: name one stream, or - for standard input.\n\n${replayUsage}`);
    return exit.usage;
  }

  const manifests: ProducerManifest[] = [];
  let text: string;
  try {
    for (const file of values.manifest ?? []) manifests.push(JSON.parse(await io.readFile(file)));
    text = positionals[0] === "-" ? await io.readStdin() : await io.readFile(positionals[0]);
  } catch (error) {
    io.stderr(`hos replay: ${(error as Error).message}\n`);
    return exit.usage;
  }
  if (!manifests.length) io.stderr("hos replay: no --manifest given, so every fact is undeclared and nothing is applied.\n");

  const replayed: Array<{ line: number; event: HosFact }> = [];
  const skipped: Array<{ line: number; reason: string }> = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    if (!raw.trim()) return;
    let document: unknown;
    try {
      document = JSON.parse(raw);
    } catch (error) {
      skipped.push({ line: index + 1, reason: `not JSON: ${(error as Error).message}` });
      return;
    }
    const { kind, errors } = validate(document);
    if (kind === "event" && !errors.length) replayed.push({ line: index + 1, event: document as HosFact });
    else skipped.push({ line: index + 1, reason: errors[0]?.message ?? `a ${kind}, not an event` });
  });
  const steps = replayArrivalReadiness(
    replayed.map((item) => item.event),
    manifests,
    { ready_housekeeping_statuses: values.ready ?? ["clean", "inspected"] },
  );

  if (values.json) {
    const deliveries = steps.map((step, index) => ({
      line: replayed[index].line,
      source: step.event.source,
      id: step.event.id,
      type: step.event.type,
      disposition: step.disposition,
      stays: Object.fromEntries(Object.entries(step.stays).map(([id, view]) => [id, { stay_status: view.stay_status, unit_id: view.unit_id, readiness: view.readiness, situation: view.situation }])),
      situations: step.emitted,
    }));
    io.stdout(`${JSON.stringify({ deliveries, skipped }, null, 2)}\n`);
  } else {
    const lines: string[] = [];
    const width = String(Math.max(0, ...replayed.map((item) => item.line))).length;
    const previous = new Map<string, string>();
    const skippedAt = new Map(skipped.map((item) => [item.line, item.reason]));
    let next = 0;
    for (const [index, step] of steps.entries()) {
      const line = replayed[index].line;
      for (; next < skipped.length && skipped[next].line < line; next += 1) lines.push(`${String(skipped[next].line).padStart(width)}  skipped                ${skipped[next].reason}`);
      lines.push(`${String(line).padStart(width)}  ${step.disposition.padEnd(21)}  ${step.event.type} · ${step.event.id} · ${step.event.source}`);
      for (const view of Object.values(step.stays)) {
        const shown = stayLine(view);
        if (previous.get(view.stay_id) !== shown) lines.push(`${" ".repeat(width)}  ${shown}`);
        previous.set(view.stay_id, shown);
      }
      for (const situation of step.emitted) {
        const data = situation.data;
        lines.push(
          situation.type === "arrival.room_readiness_at_risk"
            ? `${" ".repeat(width)}  ▲ at risk: ${data.stay_id} in unit ${data.unit_id ?? "none"}, expected ${situation.data.expected_arrival_at}, planned ${data.planned_arrival_at}`
            : `${" ".repeat(width)}  ▼ resolved: ${data.stay_id}, ${"reason" in data ? data.reason : ""}`,
        );
      }
    }
    for (; next < skipped.length; next += 1) lines.push(`${String(skipped[next].line).padStart(width)}  skipped                ${skipped[next].reason}`);
    const counts = new Map<Disposition, number>();
    for (const step of steps) counts.set(step.disposition, (counts.get(step.disposition) ?? 0) + 1);
    const situations = steps.reduce((total, step) => total + step.emitted.length, 0);
    lines.push(
      "",
      `${plural(steps.length, "delivery")}: ${[...counts].map(([disposition, count]) => `${count} ${disposition}`).join(", ")} · ${plural(situations, "situation")}${skippedAt.size ? ` · ${plural(skippedAt.size, "line")} skipped` : ""}`,
    );
    io.stdout(`${lines.join("\n")}\n`);
  }
  return skipped.length ? exit.invalid : exit.ok;
}
