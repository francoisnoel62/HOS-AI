import { describe, expect, it } from "vitest";

import { analyticsEvents, isAllowedAnalyticsEvent } from "@/lib/analytics/events";

describe("analytics boundary", () => {
  it("only exposes the five approved aggregate event names", () => {
    expect(analyticsEvents).toEqual([
      "participation_path_opened",
      "form_started",
      "form_step_abandoned",
      "form_submitted",
      "resource_link_opened",
    ]);
  });

  it("refuses a name that could introduce a new tracking category", () => {
    expect(isAllowedAnalyticsEvent("email_captured")).toBe(false);
  });
});
