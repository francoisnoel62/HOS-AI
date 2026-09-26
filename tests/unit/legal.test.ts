import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as purgeRoute } from "@/app/api/cron/purge/route";
import { purgeExpiredRecords } from "@/lib/forms/retention";
import { documentDates, legalText, pending, pendingLegalFields, privacyVersion } from "@/lib/legal";

describe("legal facts", () => {
  it("renders a missing fact as a visible placeholder", () => {
    expect(legalText(pending("Telephone number"))).toBe("[To complete: Telephone number]");
    expect(legalText("Vercel Inc.")).toBe("Vercel Inc.");
  });

  it("lists each open placeholder once, however many pages use it", () => {
    const open = pendingLegalFields();
    expect(open).toEqual([...new Set(open)]);
  });

  it("stores submissions under the privacy notice version the page shows", () => {
    expect(privacyVersion).toBe(documentDates.privacy);
  });
});

describe("retention purge", () => {
  it("deletes submissions past their retention date and expired rate-limit keys", async () => {
    const now = new Date("2027-07-30T03:00:00.000Z");
    const query = vi.fn().mockResolvedValueOnce({ rowCount: 2 }).mockResolvedValueOnce({ rowCount: 5 });
    await expect(purgeExpiredRecords({ query } as never, now)).resolves.toEqual({ submissions: 2, abuseKeys: 5 });
    expect(query).toHaveBeenNthCalledWith(1, "DELETE FROM submissions WHERE retention_due_at <= $1", [now]);
    expect(query).toHaveBeenNthCalledWith(2, "DELETE FROM abuse_keys WHERE expires_at <= $1", [now]);
  });
});

describe("retention purge endpoint", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses a request without the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "cron-test-secret");
    expect((await purgeRoute(new Request("http://localhost/api/cron/purge"))).status).toBe(401);
    expect((await purgeRoute(new Request("http://localhost/api/cron/purge", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
  });

  it("refuses every request while no cron secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await purgeRoute(new Request("http://localhost/api/cron/purge", { headers: { authorization: "Bearer " } }))).status).toBe(401);
  });

  it("skips the purge when no database is configured", async () => {
    vi.stubEnv("CRON_SECRET", "cron-test-secret");
    vi.stubEnv("DATABASE_URL", "");
    expect((await purgeRoute(new Request("http://localhost/api/cron/purge", { headers: { authorization: "Bearer cron-test-secret" } }))).status).toBe(
      503,
    );
  });
});
