import { execFileSync, execSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Tries the SDK and the CLI as a new user would, on this machine: packs them as npm would publish them, installs the two
// archives in an empty project, then runs hos there. The reference implementation must pass every scenario, and the
// Python example the normative level. It checks what the packages ship, the hos command, and the --impl command run
// through this system's shell, whose quoting differs on Windows.
//
//   npm run packages:try
//
// npx runs with --no, so a missing hos command fails instead of installing the unrelated hos package from npm.

const root = path.resolve(import.meta.dirname, "..");
const project = mkdtempSync(path.join(tmpdir(), "hos-try-"));

function run(command: string, cwd = project) {
  console.log(`\n$ ${command}`);
  execSync(command, { cwd, stdio: "inherit" });
}

// Python 3.11 or later, as the example needs. A CI must have it; elsewhere, without it, the example is skipped.
const python = ["python3", "python"].find((command) => {
  try {
    return /Python 3\.(1[1-9]|[2-9]\d)/.test(execFileSync(command, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return false;
  }
});
if (!python && process.env.CI) throw new Error("The Python example needs Python 3.11 or later.");

try {
  run(`npm pack --workspaces --pack-destination "${project}"`, root);
  writeFileSync(path.join(project, "package.json"), `${JSON.stringify({ name: "hos-try", private: true })}\n`);
  run(
    `npm install --no-audit --no-fund ${readdirSync(project)
      .filter((file) => file.endsWith(".tgz"))
      .join(" ")}`,
  );
  run("npx --no -- hos --version");
  run('npx --no -- hos conformance run --all --impl "hos reference-impl"');
  if (python) {
    copyFileSync(path.join(root, "examples/python-dispositions/impl.py"), path.join(project, "impl.py"));
    run(`npx --no -- hos conformance run --all --level normative --impl "${python} impl.py"`);
  } else {
    console.log("\nPython 3.11 or later was not found: the Python example is skipped.");
  }
} finally {
  rmSync(project, { recursive: true, force: true, maxRetries: 5 });
}
