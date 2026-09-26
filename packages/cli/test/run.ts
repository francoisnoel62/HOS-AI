import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Io } from "../src/io.ts";
import { main } from "../src/main.ts";

// Runs hos in process, against the published corpus or files given in memory, and web documents given in memory.

export const specDirectory = fileURLToPath(new URL("../../../public/spec/0.1/", import.meta.url));

export async function hos(
  args: string[],
  { files = {}, urls = {}, stdin = "", cwd = specDirectory }: { files?: Record<string, string>; urls?: Record<string, string>; stdin?: string; cwd?: string } = {},
) {
  const written: Record<string, string> = {};
  let stdout = "";
  let stderr = "";
  const io: Io = {
    cwd,
    readFile: async (file) => files[file] ?? readFile(path.resolve(cwd, file), "utf8"),
    writeFile: async (file, text) => {
      written[file] = text;
    },
    writeSecret: async (file, text) => {
      if (Object.hasOwn(files, file) || Object.hasOwn(written, file)) throw Object.assign(new Error(`EEXIST: file already exists, open '${file}'`), { code: "EEXIST" });
      written[file] = text;
    },
    readStdin: async () => stdin,
    fetchText: async (url) => {
      if (!Object.hasOwn(urls, url)) throw new Error(`${url} answers 404 Not Found`);
      return urls[url];
    },
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
  };
  const code = await main(args, io);
  return { code, stdout, stderr, written };
}

// Runs the real command from its sources, as a user would, with the SDK from its sources too.
export function spawnHos(args: string[], stdin?: string) {
  const bin = fileURLToPath(new URL("../src/bin.ts", import.meta.url));
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = execFile(process.execPath, ["--conditions=@hos-ai/source", bin, ...args], { cwd: specDirectory }, (error, stdout, stderr) =>
      resolve({ code: error ? Number(error.code) : 0, stdout, stderr }),
    );
    child.stdin!.end(stdin ?? "");
  });
}
