import { writeFile } from "node:fs/promises";

import type { SyncReport } from "../lib/hos/mappings/sync";

// Prints a live check's report and writes it to --out. context comes first in the file: the PMS environment, window and
// configuration the run used. notes are printed under the heading. The file keeps HOS ids, counts and room names only,
// and the facts themselves with --events.
export async function writeLiveReport(
  report: SyncReport<Record<string, number>>,
  { heading, notes = [], context, out, events }: { heading: string; notes?: string[]; context: Record<string, unknown>; out?: string; events: boolean },
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
