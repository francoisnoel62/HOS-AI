import { Pool } from "pg";

let pool: Pool | undefined;

export function getDb() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be configured before forms can persist data.");
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  return pool;
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
