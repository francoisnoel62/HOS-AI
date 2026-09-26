"use client";

import { ArrowDown, Check, CircleAlert, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";

// Plain-language labels for the arrival-readiness conformance scenario, for readers who do not know the event types.
const events = [
  { label: "Booking confirmed", source: "PMS", icon: "reservation" },
  { label: "Guest due today, room 204", source: "PMS", icon: "stay" },
  { label: "Room 204 is dirty", source: "Housekeeping", icon: "unit" },
  { label: "Cleaned, not yet inspected", source: "Housekeeping", icon: "task" },
  { label: "“We'll arrive early”", source: "Guest message", icon: "message" },
];

export function EventFlowDiagram() {
  return (
    <figure className="diagram-grid overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--card)] p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <p className="font-mono text-xs text-[var(--muted-foreground)]">HOS 0.1 · Example</p>
          <p className="mt-1 text-sm font-medium">One arrival, three systems</p>
        </div>
        <Badge variant="active"><Sparkles aria-hidden="true" size={12} /> Early arrival</Badge>
      </div>
      <ol className="space-y-1" aria-label="What each system reports about the arrival">
        {events.map((event, index) => (
          <li className="flex gap-3" key={event.label}>
            <div className="flex w-5 flex-col items-center pt-1">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--background)] font-mono text-[0.62rem]">
                {index + 1}
              </span>
              {index < events.length - 1 ? <span className="h-7 border-l border-dashed border-[var(--border-strong)]" /> : null}
            </div>
            <div className="mb-1 flex min-h-12 flex-1 items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2">
              <span className="font-mono text-xs sm:text-sm">{event.label}</span>
              <span className="shrink-0 text-xs text-[var(--muted-foreground)]">{event.source}</span>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex items-center gap-2 border-t border-[var(--border)] pt-4 text-sm">
        <ArrowDown aria-hidden="true" className="text-[var(--accent)]" size={16} />
        <span className="font-mono text-[var(--accent-strong)]">Alert: room 204 may not be ready in time</span>
      </div>
      <figcaption className="sr-only">
        The PMS, housekeeping and a guest message each report part of one arrival. Put together, they show that room 204 may not be ready when the guest arrives early. HOS raises the alert; it does not change a booking or check a guest in.
      </figcaption>
    </figure>
  );
}

export function ReadinessRiskCard() {
  return (
    <aside aria-label="Example alert" className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-5">
      <div className="flex items-start gap-3">
        <CircleAlert aria-hidden="true" className="mt-0.5 text-[var(--warning)]" size={20} />
        <div>
          <Badge variant="warning">Alert</Badge>
          <h3 className="mt-3 text-lg font-semibold tracking-[-0.04em]">Room 204 may not be ready in time</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
            The guest has written that they will arrive early, and the room has been cleaned but not inspected. The front desk sees it now, with where each piece of information came from, not when the guest is at the desk.
          </p>
          <div className="mt-4 flex items-center gap-2 font-mono text-xs"><Check aria-hidden="true" size={14} /> HOS alerts. Your team decides.</div>
        </div>
      </div>
    </aside>
  );
}

const pmsRuns = [
  { name: "Mews", result: "Run on Mews's public demo hotels: 3,485 updates translated, zero errors." },
  { name: "Apaleo", result: "Run on five Apaleo sample hotels: 740 updates translated, zero errors." },
  { name: "Cloudbeds", result: "Works on sample data. Waiting for a real test property." },
];

export function PmsProofCard() {
  return (
    <aside aria-label="PMS tests" className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <Badge>Experimental</Badge>
      <h3 className="mt-3 text-lg font-semibold tracking-[-0.04em]">Early connectors for three PMSs</h3>
      <ul className="mt-3 divide-y divide-[var(--border)]">
        {pmsRuns.map((pms) => (
          <li className="flex gap-4 py-3 text-sm leading-6" key={pms.name}>
            <span className="w-24 shrink-0 font-medium">{pms.name}</span>
            <span className="text-[var(--muted-foreground)]">{pms.result}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">
        Unofficial connectors, built from each PMS&apos;s public documentation. No PMS vendor has validated them yet.
      </p>
    </aside>
  );
}
