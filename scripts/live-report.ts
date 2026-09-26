import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { checkProducer, type HosFact } from "@hos-ai/sdk";

import type { SyncReport } from "../lib/hos/mappings/sync";

// Prints a live check's report and writes it to --out. context comes first in the file: the PMS environment, window and
// configuration the run used. notes are printed under the heading. The file keeps HOS ids, counts and room names only,
// and the facts themselves with --events.
//
// It also writes the producer's files to record, a local directory git ignores: manifest.json, recording.jsonl with the
// facts, and redelivery.jsonl with the facts a restarted adapter published from the same data. Then it runs the
// producer check on them, which hos conformance producer runs too.
export async function writeLiveReport(
  report: SyncReport<Record<string, number>>,
  { heading, notes = [], context, out, events, record }: { heading: string; notes?: string[]; context: Record<string, unknown>; out?: string; events: boolean; record: string },
) {
  const summary = {
    ...context,
    fetched: report.fetched,
    hos_events: report.events.length,
    events_by_type: report.events_by_type,
    schema_errors: report.schema_errors,
    failures: report.failures,
    resync_events: report.resync_events,
    unmapped: report.unmapped,
    dispositions: report.dispositions,
    situations: report.situations,
    arrivals: report.arrivals,
  };

  const arrivals = report.arrivals.stays;
  // Readiness is a question for a guest still to arrive: a stay already in house or gone reads not ready in its used room.
  const expected = arrivals.filter((stay) => stay.stay_status === "expected");
  const count = (predicate: (stay: (typeof arrivals)[number]) => boolean) => expected.filter(predicate).length;
  const started = Object.entries(
    arrivals.filter((stay) => stay.stay_status !== "expected").reduce<Record<string, number>>((counts, stay) => ({ ...counts, [stay.stay_status]: (counts[stay.stay_status] ?? 0) + 1 }), {}),
  ).map(([status, total]) => `${total} ${status.replaceAll("_", " ")}`);
  console.log(heading);
  console.log(`Fetched ${Object.entries(report.fetched).map(([entity, total]) => `${total} ${entity.replaceAll("_", " ")}`).join(", ")}.`);
  for (const note of notes) console.log(note);
  console.log(`HOS facts: ${report.events.length}, schema errors: ${report.schema_errors.length}, failures: ${report.failures.length}, facts on a second pass: ${report.resync_events}`);
  for (const [type, total] of Object.entries(report.events_by_type).sort()) console.log(`  ${type.padEnd(28)} ${total}`);
  console.log("Not mapped:");
  for (const { event, reason, count: total } of report.unmapped) console.log(`  ${String(total).padStart(5)}  ${event}: ${reason}`);
  console.log(`Dispositions: ${JSON.stringify(report.dispositions)}; situations: ${JSON.stringify(report.situations)}`);
  console.log(
    `Arrivals on ${report.arrivals.business_date}: ${arrivals.length}${started.length ? ` (${started.join(", ")})` : ""}; still expected ${expected.length} — ready ${count((stay) => stay.readiness === "ready")}, not ready ${count((stay) => stay.readiness === "not_ready")}, unknown ${count((stay) => stay.readiness === "unknown")}, blocked by maintenance ${count((stay) => Boolean(stay.maintenance))}, at risk ${count((stay) => stay.situation === "at_risk")}`,
  );
  if (out) {
    await writeFile(out, `${JSON.stringify(events ? { ...summary, events: report.events } : summary, null, 2)}\n`);
    console.log(`Report written to ${out}.`);
  }
  if (report.schema_errors.length || report.failures.length || report.resync_events) process.exitCode = 1;

  const lines = (facts: HosFact[]) => facts.map((fact) => `${JSON.stringify(fact)}\n`).join("");
  const files = { manifest: path.join(record, "manifest.json"), stream: path.join(record, "recording.jsonl"), redelivery: path.join(record, "redelivery.jsonl") };
  await mkdir(record, { recursive: true });
  await writeFile(files.manifest, `${JSON.stringify(report.manifest, null, 2)}\n`);
  await writeFile(files.stream, lines(report.events));
  await writeFile(files.redelivery, lines(report.redelivery));
  const check = checkProducer({ manifest: report.manifest, recording: lines(report.events), redelivery: lines(report.redelivery) });
  console.log(
    `Producer check: ${check.valid ? "passed" : "failed"}. ${report.redelivery.length} of ${report.events.length} facts published again by a restarted adapter, ${check.redelivery?.repeated ?? 0} with the same id and content.`,
  );
  const problems = [...check.manifest.errors, ...check.recording.issues, ...(check.redelivery?.issues ?? [])].filter((issue) => !("severity" in issue) || issue.severity === "error");
  for (const problem of problems.slice(0, 10)) console.log(`  ${"line" in problem && problem.line ? `line ${problem.line}: ` : ""}${problem.message}`);
  console.log(`Files in ${record}. Check them again with: hos conformance producer --manifest ${files.manifest} --stream ${files.stream} --redelivery ${files.redelivery}`);
  if (!check.valid) process.exitCode = 1;
}

export function runLiveCheck(main: () => Promise<void>) {
  main().catch((error: unknown) => {
    // fetch reports network failures, such as a refused proxy tunnel, in its cause.
    const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
    console.error(error instanceof Error ? `${error.message}${cause}` : error);
    // Not process.exit: on Windows, exiting while fetch still holds its sockets aborts Node on a libuv assertion.
    process.exitCode = 1;
  });
}
