import { parseArgs } from "node:util";

import { type ProducerManifest, type StreamIssue, validate, validateStream, type ValidationError } from "@hos-ai/sdk";

import { issueLines, plural } from "./format.ts";
import { exit, type Io } from "./io.ts";

// hos validate: events, reference situations and producer manifests, one JSON document per file, and event streams,
// one event per line. A .jsonl file is a stream; on standard input, a text that is not one JSON document is read as one.

export const validateUsage = `Usage: hos validate [options] <file...>

Validates HOS events, reference situations and producer manifests (.json), and event streams (.jsonl, one event
per line). - reads standard input.

Options:
  -m, --manifest <file>  a producer manifest to check the streams against; repeat it for each producer
      --json             print the results as JSON
  -h, --help             show this help

Exit codes: 0 when every file is valid, 1 when one is not, 2 for a usage or read error.
`;

type DocumentResult = { file: string; valid: boolean; kind: "event" | "situation" | "manifest" | null; name?: string; errors: ValidationError[] };
type StreamResult = { file: string; valid: boolean; kind: "stream"; events: number; issues: StreamIssue[] };
type Result = DocumentResult | StreamResult;

function parse(text: string): { value: unknown } | { error: string } {
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

// What a document is, for its summary line: an event or a situation by its type, a manifest by its producer.
function nameOf(document: unknown) {
  if (typeof document !== "object" || document === null) return undefined;
  const { type, producer } = document as Record<string, unknown>;
  return typeof type === "string" ? type : typeof producer === "string" ? producer : undefined;
}

function human(result: Result) {
  const mark = result.valid ? "✓" : "✗";
  const verdict = result.valid ? "valid" : "invalid";
  if (result.kind === "stream") {
    const count = (severity: StreamIssue["severity"]) => result.issues.filter((issue) => issue.severity === severity).length;
    const summary = [plural(count("error"), "error"), plural(count("warning"), "warning"), plural(count("info"), "note")]
      .filter((part) => !part.startsWith("0 "))
      .join(", ");
    return [
      `${mark} ${result.file}: ${verdict} stream of ${plural(result.events, "event")}${summary ? ` (${summary})` : ""}`,
      ...result.issues.flatMap((issue) =>
        issueLines(
          issue.severity === "info" ? "note" : issue.severity,
          issue.line === null ? issue.message : `line ${issue.line}: ${issue.message}`,
          issue,
        ),
      ),
    ];
  }
  const what = result.kind ? `${result.kind}${result.name ? ` ${result.name}` : ""}` : "document";
  return [
    `${mark} ${result.file}: ${verdict} ${what}${result.errors.length ? ` (${plural(result.errors.length, "error")})` : ""}`,
    ...result.errors.flatMap((error) => issueLines("error", error.message, error)),
  ];
}

export async function validateCommand(args: string[], io: Io): Promise<number> {
  let options;
  try {
    options = parseArgs({
      args,
      allowPositionals: true,
      options: { manifest: { type: "string", short: "m", multiple: true }, json: { type: "boolean" }, help: { type: "boolean", short: "h" } },
    });
  } catch (error) {
    io.stderr(`hos validate: ${(error as Error).message}\nRun hos validate --help for usage.\n`);
    return exit.usage;
  }
  if (options.values.help) {
    io.stdout(validateUsage);
    return exit.ok;
  }
  const files = options.positionals;
  if (!files.length) {
    io.stderr(`hos validate: name at least one file, or - for standard input.\n\n${validateUsage}`);
    return exit.usage;
  }

  let unreadable = false;
  const read = async (file: string) => {
    try {
      return file === "-" ? await io.readStdin() : await io.readFile(file);
    } catch (error) {
      io.stderr(`hos validate: cannot read ${file}: ${(error as Error).message}\n`);
      unreadable = true;
      return undefined;
    }
  };

  const manifests: ProducerManifest[] = [];
  for (const file of options.values.manifest ?? []) {
    const text = await read(file);
    if (text === undefined) continue;
    const parsed = parse(text);
    if ("value" in parsed) manifests.push(parsed.value as ProducerManifest);
    else {
      io.stderr(`hos validate: the manifest ${file} is not JSON: ${parsed.error}\n`);
      unreadable = true;
    }
  }
  if (unreadable) return exit.usage;

  const results: Result[] = [];
  for (const file of files) {
    const text = await read(file);
    if (text === undefined) continue;
    const label = file === "-" ? "<stdin>" : file;
    const parsed = parse(text);
    if (/\.(jsonl|ndjson)$/i.test(file) || (file === "-" && "error" in parsed)) {
      results.push({ file: label, kind: "stream", ...validateStream(text, { manifests }) });
    } else if ("error" in parsed) {
      results.push({ file: label, valid: false, kind: null, errors: [{ path: "", message: `Not JSON: ${parsed.error}.` }] });
    } else {
      results.push({ file: label, name: nameOf(parsed.value), ...validate(parsed.value) });
    }
  }
  if (manifests.length && !results.some((result) => result.kind === "stream"))
    io.stderr("hos validate: --manifest applies to streams (.jsonl) only.\n");

  const valid = results.every((result) => result.valid);
  if (options.values.json) io.stdout(`${JSON.stringify({ valid, results }, null, 2)}\n`);
  else if (results.length) {
    const output = results.flatMap(human);
    if (results.length > 1)
      output.push(
        "",
        `${plural(results.length, "file")}: ${results.filter((result) => result.valid).length} valid, ${results.filter((result) => !result.valid).length} invalid`,
      );
    io.stdout(`${output.join("\n")}\n`);
  }
  if (unreadable) return exit.usage;
  return valid ? exit.ok : exit.invalid;
}
