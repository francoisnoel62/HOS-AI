import { closeDb, getDb } from "../lib/forms/db";
import { purgeExpiredRecords } from "../lib/forms/retention";

async function purge() {
  const purged = await purgeExpiredRecords(getDb());
  console.log(`Deleted ${purged.submissions} expired submission(s) and ${purged.abuseKeys} expired rate-limit key(s).`);
}

purge().finally(closeDb);
