"use client";

import { ArrowDown, Check, CircleAlert, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";

const events = [
  { label: "Reservation updated", source: "PMS", icon: "reservation" },
  { label: "Stay expected", source: "PMS", icon: "stay" },
  { label: "Unit remains dirty", source: "Housekeeping", icon: "unit" },
  { label: "Task completed", source: "Housekeeping", icon: "task" },
  { label: "Early-arrival signal", source: "Messaging", icon: "message" },
];

export function EventFlowDiagram() {
  return (
    <figure className="diagram-grid overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--card)] p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <p className="font-mono text-xs text-[var(--muted-foreground)]">HOS / 0.1 / Observe</p>
          <p className="mt-1 text-sm font-medium">Arrival-readiness projection</p>
        </div>
        <Badge variant="active"><Sparkles aria-hidden="true" size={12} /> Event flow</Badge>
      </div>
      <ol className="space-y-1" aria-label="Arrival-readiness event sequence">
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
        <span className="font-mono text-[var(--accent-strong)]">arrival.room_readiness_at_risk</span>
      </div>
      <figcaption className="sr-only">
        A sequence of five traceable events from PMS, housekeeping and guest messaging produces an arrival room-readiness-at-risk projection. HOS 0.1 observes the facts; it does not change a booking or check a guest in.
      </figcaption>
    </figure>
  );
}

export function ReadinessRiskCard() {
  return (
    <aside aria-label="Example readiness risk projection" className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-5">
      <div className="flex items-start gap-3">
        <CircleAlert aria-hidden="true" className="mt-0.5 text-[var(--warning)]" size={20} />
        <div>
          <Badge variant="warning">Situation detected</Badge>
          <h3 className="mt-3 text-lg font-semibold tracking-[-0.04em]">Readiness at risk</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
            An early-arrival signal conflicts with a unit still declared dirty. The sources, timestamps and authority remain visible for an operator to assess.
          </p>
          <div className="mt-4 flex items-center gap-2 font-mono text-xs"><Check aria-hidden="true" size={14} /> Observe only in HOS 0.1</div>
        </div>
      </div>
    </aside>
  );
}
