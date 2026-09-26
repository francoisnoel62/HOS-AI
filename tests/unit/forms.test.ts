import { describe, expect, it } from "vitest";

import { formSchemas, retentionDueAt } from "@/lib/forms/schema";

describe("founding-member form boundary", () => {
  it("accepts the minimal professional qualification requested by the public form", () => {
    const result = formSchemas.founding_member.safeParse({
      contactName: "Avery Chen",
      email: "avery@example.org",
      organization: "Northstar Hotels",
      country: "France",
      role: "Operations Director",
      actorType: "Operator",
      interestArea: "Interoperability",
      systemCategories: ["PMS", "Housekeeping"],
      engagementLevel: "Explore founding participation",
      futureRepresentatives: "yes",
      context: "We want to help validate the first arrival-readiness scenario.",
      website: "https://northstar.example",
      websiteTrap: "",
      privacyAccepted: "on",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a candidate with no professional email", () => {
    const result = formSchemas.founding_member.safeParse({
      contactName: "Avery Chen",
      email: "not-an-email",
      organization: "Northstar Hotels",
      country: "France",
      role: "Operations Director",
      actorType: "Operator",
      interestArea: "Interoperability",
      systemCategories: ["PMS"],
      engagementLevel: "Explore founding participation",
      futureRepresentatives: "yes",
      context: "We want to help validate the first arrival-readiness scenario.",
      website: "",
      websiteTrap: "",
      privacyAccepted: "on",
    });

    expect(result.success).toBe(false);
  });
});

describe("retention boundary", () => {
  it("retains a submission for twelve months after the last exchange", () => {
    expect(retentionDueAt(new Date("2026-07-30T10:00:00.000Z"))).toEqual(new Date("2027-07-30T10:00:00.000Z"));
  });
});
