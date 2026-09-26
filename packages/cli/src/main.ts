import { readFileSync } from "node:fs";

import { HOS_SPEC_VERSION } from "@hos-ai/sdk";

import { conformanceCommand } from "./conformance/command.ts";
import { referenceImplCommand } from "./conformance/reference-impl.ts";
import { exit, type Io } from "./io.ts";
import { replayCommand } from "./replay.ts";
import { validateCommand } from "./validate.ts";

// The hos command: one subcommand per task, each with its own --help.

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

export const usage = `Usage: hos <command> [options]

Tools for HOS ${HOS_SPEC_VERSION}.

Commands:
  validate <file...>        validate events, reference situations and manifests (.json), and event streams (.jsonl)
  conformance list          list the conformance scenarios
  conformance run <...>     run the conformance scenarios through an implementation, in any language
  replay <stream.jsonl>     replay a recorded stream through the reference projection, delivery by delivery

Options:
  -h, --help                show this help
  -v, --version             print the version

Run hos <command> --help for the options of a command.
`;

// reference-impl is left out of the help: it serves the tool's own conformance check.
const commands: Record<string, (args: string[], io: Io) => Promise<number>> = {
  validate: validateCommand,
  conformance: conformanceCommand,
  replay: replayCommand,
  "reference-impl": referenceImplCommand,
};

export async function main(args: string[], io: Io): Promise<number> {
  const [command, ...rest] = args;
  if (command === "-h" || command === "--help" || command === "help") {
    io.stdout(usage);
    return exit.ok;
  }
  if (command === "-v" || command === "--version") {
    io.stdout(`@hos-ai/cli ${version} (HOS ${HOS_SPEC_VERSION})\n`);
    return exit.ok;
  }
  if (!command || !Object.hasOwn(commands, command)) {
    io.stderr(`${command ? `hos: unknown command ${command}` : "hos: name a command"}.\n\n${usage}`);
    return exit.usage;
  }
  return commands[command](rest, io);
}
