import { readFileSync } from "node:fs";
import path from "node:path";

// Checks, before the release workflow publishes, that the packages are ready for the version of the tag: both packages
// carry it, the CLI depends on that exact SDK, neither is private, and each changelog dates it.
//
//   node scripts/check-release.ts 0.1.0-alpha.1

const version = process.argv[2];
if (!version) throw new Error("Give the version to release, such as 0.1.0-alpha.1.");

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const problems: string[] = [];

for (const name of ["sdk", "cli"]) {
  const pkg = JSON.parse(read(`packages/${name}/package.json`)) as {
    version: string;
    private?: boolean;
    dependencies?: Record<string, string>;
  };
  if (pkg.version !== version) problems.push(`packages/${name}/package.json has version ${pkg.version}, not ${version}.`);
  if (pkg.private) problems.push(`packages/${name}/package.json is private, so npm refuses to publish it.`);
  if (name === "cli" && pkg.dependencies?.["@hos-ai/sdk"] !== version)
    problems.push(`@hos-ai/cli depends on @hos-ai/sdk ${pkg.dependencies?.["@hos-ai/sdk"]}, not ${version}.`);
  const heading = read(`packages/${name}/CHANGELOG.md`)
    .split("\n")
    .find((line) => line.startsWith(`## ${version} `));
  if (!heading) problems.push(`packages/${name}/CHANGELOG.md has no heading for ${version}.`);
  else if (!/\(\d{4}-\d{2}-\d{2}\)$/.test(heading)) problems.push(`packages/${name}/CHANGELOG.md does not date ${version}: ${heading}`);
}

if (problems.length) {
  console.error(`Not ready to release ${version}:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
  process.exit(1);
}
console.log(`@hos-ai/sdk and @hos-ai/cli are ready to release ${version}.`);
