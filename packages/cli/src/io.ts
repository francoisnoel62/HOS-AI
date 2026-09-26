import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// What a command reads and writes. The tests replace it to run commands in process.

export type Io = {
  cwd: string;
  // A file, relative to cwd.
  readFile(file: string): Promise<string>;
  writeFile(file: string, text: string): Promise<void>;
  readStdin(): Promise<string>;
  stdout(text: string): void;
  stderr(text: string): void;
};

export function nodeIo(): Io {
  const cwd = process.cwd();
  return {
    cwd,
    readFile: (file) => readFile(path.resolve(cwd, file), "utf8"),
    writeFile: (file, text) => writeFile(path.resolve(cwd, file), text),
    async readStdin() {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks).toString("utf8");
    },
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  };
}

// Exit codes: 0 when everything checked passes, 1 when something is invalid, 2 for a usage or read error.
export const exit = { ok: 0, invalid: 1, usage: 2 } as const;
