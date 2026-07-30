import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { getDb, closeDb } from "../lib/forms/db";

async function migrate() {
  const db = getDb();
  await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  const directory = path.resolve("database/migrations");
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const applied = await db.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
    if (applied.rowCount) continue;
    const sql = await readFile(path.join(directory, file), "utf8");
    await db.query("BEGIN");
    try {
      await db.query(sql);
      await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await db.query("COMMIT");
      console.log(`Applied ${file}`);
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  }
}

migrate().finally(closeDb);
