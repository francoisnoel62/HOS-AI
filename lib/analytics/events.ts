export const analyticsEvents = [
  "participation_path_opened",
  "form_started",
  "form_step_abandoned",
  "form_submitted",
  "resource_link_opened",
] as const;

export type AnalyticsEvent = (typeof analyticsEvents)[number];

export function isAllowedAnalyticsEvent(value: string): value is AnalyticsEvent {
  return (analyticsEvents as readonly string[]).includes(value);
}

export function trackAnalyticsEvent(event: AnalyticsEvent) {
  if (typeof window === "undefined") return;
  // This local signal is intentionally payload-free. A production Vercel integration
  // may forward only these five allowlisted names.
  window.dispatchEvent(new CustomEvent("hos:analytics", { detail: { event } }));
}
