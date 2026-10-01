import { execSync } from "node:child_process";

// Applies the site's migrations to the test database once, before the test files that need it run in parallel. Without
// HOS_TEST_DATABASE_URL, the tests that need a database are skipped and nothing is applied.
export default function setup() {
  const url = process.env.HOS_TEST_DATABASE_URL;
  if (url) execSync("npx tsx scripts/migrate.ts", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
