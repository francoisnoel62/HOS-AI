import { readFileSync } from "node:fs";

import { HOS_SPEC_VERSION } from "@hos-ai/sdk";

import { exit, type Io } from "./io.ts";
import { validateCommand } from "./validate.ts";

// The hos command: one subcommand per task, each with its own --help.

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

export const usage = `Usage: hos <command> [options]

Tools for HOS ${HOS_SPEC_VERSION}.

Commands:
  validate <file...>  validate events, reference situations and manifests (.json), and event streams (.jsonl)

Options:
  -h, --help          show this help
  -v, --version       print the version

Run hos <command> --help for the options of a command.
`;

const commands: Record<string, (args: string[], io: Io) => Promise<number>> = {
  validate: validateCommand,
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
