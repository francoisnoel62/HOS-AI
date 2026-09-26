import { checkProducer, type ProducerCheck, type StreamIssue } from "@hos-ai/sdk";

import { issueLines, plural } from "../format.ts";
import { exit, type Io } from "../io.ts";

// hos conformance producer: a producer's recording and its manifest, checked as @hos-ai/sdk's checkProducer describes.

const limit = 20;

function issueList(issues: Array<StreamIssue | { severity?: undefined; line?: undefined; path: string; message: string; rule?: string }>) {
  const lines = issues.slice(0, limit).flatMap((issue) => {
    const label = issue.severity === "info" ? "note" : (issue.severity ?? "error");
    return issueLines(label, issue.line ? `line ${issue.line}: ${issue.message}` : issue.message, issue);
  });
  if (issues.length > limit) lines.push(`  ... and ${plural(issues.length - limit, "more problem")}; --json lists them all`);
  return lines;
}

const counts = (issues: StreamIssue[]) =>
  [plural(issues.filter((issue) => issue.severity === "error").length, "error"), plural(issues.filter((issue) => issue.severity === "warning").length, "warning"), plural(issues.filter((issue) => issue.severity === "info").length, "note")]
    .filter((part) => !part.startsWith("0 "))
    .join(", ");

function human(check: ProducerCheck, files: { manifest: string; stream: string; redelivery?: string }) {
  const mark = (valid: boolean) => (valid ? "✓" : "✗");
  const lines = [`Producer ${check.producer ?? "unknown"}`];
  const { manifest, recording, redelivery } = check;
  lines.push(`${mark(manifest.valid)} ${files.manifest}: ${manifest.valid ? "valid manifest, with its limitations" : `manifest that fails the checks (${plural(manifest.errors.length, "error")})`}`);
  lines.push(...issueList(manifest.errors));
  const recorded = counts(recording.issues);
  lines.push(`${mark(recording.valid)} ${files.stream}: ${plural(recording.events, "fact")}${recording.valid ? ", valid and declared" : ""}${recorded ? ` (${recorded})` : ""}`);
  lines.push(...issueList(recording.issues));
  if (redelivery && files.redelivery) {
    const summary = !redelivery.events
      ? "no fact: the producer published nothing again"
      : redelivery.valid
        ? `${plural(redelivery.events, "fact")}, each already in the recording with the same id and content`
        : `${plural(redelivery.events, "fact")}, ${redelivery.repeated} already in the recording unchanged`;
    const extra = counts(redelivery.issues);
    lines.push(`${mark(redelivery.valid)} ${files.redelivery}: ${summary}${extra ? ` (${extra})` : ""}`);
    lines.push(...issueList(redelivery.issues));
  }
  lines.push("", check.valid ? `✓ ${check.producer} passes the producer checks.` : `✗ ${check.producer ?? "The producer"} fails the producer checks.`);
  return `${lines.join("\n")}\n`;
}

export async function producerCommand({ manifest, stream, redelivery, json }: { manifest?: string; stream?: string; redelivery?: string; json?: boolean }, io: Io): Promise<number> {
  if (!manifest || !stream) {
    io.stderr("hos conformance: producer needs --manifest and --stream.\nRun hos conformance --help for usage.\n");
    return exit.usage;
  }
  let texts: { manifest: string; stream: string; redelivery?: string };
  let document: unknown;
  try {
    texts = { manifest: await io.readFile(manifest), stream: await io.readFile(stream), ...(redelivery ? { redelivery: await io.readFile(redelivery) } : {}) };
  } catch (error) {
    io.stderr(`hos conformance: ${(error as Error).message}\n`);
    return exit.usage;
  }
  try {
    document = JSON.parse(texts.manifest);
  } catch (error) {
    io.stderr(`hos conformance: the manifest ${manifest} is not JSON: ${(error as Error).message}\n`);
    return exit.usage;
  }
  const check = checkProducer({ manifest: document, recording: texts.stream, redelivery: texts.redelivery });
  io.stdout(json ? `${JSON.stringify(check, null, 2)}\n` : human(check, { manifest, stream, redelivery }));
  return check.valid ? exit.ok : exit.invalid;
}
