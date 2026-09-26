import { type ChildProcess, spawn } from "node:child_process";

// Runs an implementation under test: its command through the system shell, the whole input on standard input, then
// standard input closed. Past the timeout, the command and everything it started are stopped.

export type Run = { code: number | null; stdout: string; stderr: string; timedOut: boolean; error?: string };

function stop(child: ChildProcess) {
  if (child.pid === undefined) return;
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else {
    try {
      // The command runs in its own process group, so the shell and what it started stop together.
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

export function runImplementation(command: string, input: string, { cwd, timeoutMs }: { cwd: string; timeoutMs: number }) {
  return new Promise<Run>((resolve) => {
    const child = spawn(command, { shell: true, cwd, windowsHide: true, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const finish = (result: Pick<Run, "code"> & { error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, timedOut, ...result });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop(child);
    }, timeoutMs);
    child.stdout!.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr!.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.on("error", (error) => finish({ code: null, error: error.message }));
    child.on("close", (code) => finish({ code }));
    // An implementation may exit without reading its input.
    child.stdin!.on("error", () => {});
    child.stdin!.end(input);
  });
}
