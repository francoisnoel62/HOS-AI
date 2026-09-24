"use client";

import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { CodePanel } from "@/components/content/code-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Disposition, ReplayStep, SituationStatus, StayView } from "@/lib/hos/projection";
import { cn } from "@/lib/utils";

type Note = { delivery: number; checks: string; note: string };
type BadgeTone = "default" | "active" | "warning" | "success";

const dispositionLabels: Record<Disposition, { label: string; tone: BadgeTone }> = {
  applied: { label: "Applied", tone: "active" },
  duplicate: { label: "Duplicate · ignored", tone: "default" },
  superseded: { label: "Older · not applied", tone: "default" },
  non_authoritative: { label: "Not authoritative", tone: "warning" },
  undeclared_producer: { label: "Undeclared producer", tone: "warning" },
};

const situationLabels: Record<SituationStatus, { label: string; tone: BadgeTone }> = {
  none: { label: "No situation", tone: "default" },
  at_risk: { label: "Readiness at risk", tone: "warning" },
  resolved: { label: "Resolved", tone: "success" },
};

export function ArrivalReplay({ steps, notes, timezone, stayId, producerLabels }: { steps: ReplayStep[]; notes: Note[]; timezone: string; stayId: string; producerLabels: Record<string, string> }) {
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: timezone });
  const localTime = (iso: string) => clock.format(new Date(iso));
  const producer = (source: string) => producerLabels[source] ?? source;

  const step = position > 0 ? steps[position - 1] : undefined;
  const stay: StayView | undefined = step?.stays[stayId];
  const note = step ? notes.find((item) => item.delivery === step.delivery) : undefined;
  const finished = position >= steps.length;

  const running = playing && !finished;

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setPosition((current) => Math.min(current + 1, steps.length)), 1800);
    return () => window.clearTimeout(timer);
  }, [running, position, steps.length]);

  const emitted = step?.emitted[0];
  const panel = emitted
    ? { label: `Emitted · ${emitted.type}`, code: JSON.stringify(emitted, null, 2) }
    : step
      ? { label: `Delivery ${step.delivery} · ${step.event.type}`, code: JSON.stringify(step.event, null, 2) }
      : undefined;
  const situation = situationLabels[stay?.situation ?? "none"];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <Card className="self-start">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <p className="eyebrow">Delivered to HOS, in this order</p>
          <p className="font-mono text-xs text-[var(--muted-foreground)]">{position} / {steps.length}</p>
        </div>
        <ol aria-label="Synthetic event stream">
          {steps.map((item) => {
            const delivered = item.delivery <= position;
            const current = item.delivery === position;
            const disposition = dispositionLabels[item.disposition];
            return (
              <li className="border-b border-[var(--border)] last:border-b-0" key={item.delivery}>
                <button
                  aria-current={current ? "step" : undefined}
                  aria-label={`Show delivery ${item.delivery}: ${item.event.type} from ${producer(item.event.source)}`}
                  className={cn(
                    "grid w-full grid-cols-[2rem_1fr_auto] items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]",
                    current && "bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)]",
                  )}
                  onClick={() => {
                    setPlaying(false);
                    setPosition(item.delivery);
                  }}
                  type="button"
                >
                  <span className="mt-0.5 font-mono text-xs text-[var(--muted-foreground)]">#{item.delivery}</span>
                  <span className="min-w-0">
                    <span className={cn("block truncate font-mono text-[0.8rem]", !delivered && "text-[var(--muted-foreground)]")}>{item.event.type}</span>
                    <span className="mt-1 block text-xs text-[var(--muted-foreground)]">
                      {producer(item.event.source)} · occurred {localTime(item.event.time)}
                    </span>
                  </span>
                  <span className="min-h-5">{delivered ? <Badge variant={disposition.tone}>{disposition.label}</Badge> : <span className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Pending</span>}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setPlaying(false);
              setPosition((current) => Math.min(current + 1, steps.length));
            }}
            disabled={finished}
          >
            Deliver next event <ArrowRight aria-hidden="true" size={16} />
          </Button>
          <Button
            onClick={() => {
              if (finished) setPosition(0);
              setPlaying(finished || !running);
            }}
            variant="secondary"
          >
            {running ? <Pause aria-hidden="true" size={16} /> : <Play aria-hidden="true" size={16} />}
            {running ? "Pause" : "Play all"}
          </Button>
          <Button
            aria-label="Previous delivery"
            disabled={position === 0}
            onClick={() => {
              setPlaying(false);
              setPosition((current) => Math.max(current - 1, 0));
            }}
            variant="ghost"
          >
            <ArrowLeft aria-hidden="true" size={16} /> Back
          </Button>
          <Button
            disabled={position === 0}
            onClick={() => {
              setPlaying(false);
              setPosition(0);
            }}
            variant="ghost"
          >
            <RotateCcw aria-hidden="true" size={16} /> Reset
          </Button>
        </div>

        <Card aria-label="Arrival-readiness projection" className="p-5" role="region">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Arrival-readiness projection</p>
              <h3 className="mt-2 font-mono text-lg">{stay ? `${stay.stay_id} · ${stay.unit_id ?? "unit not assigned"}` : "Waiting for facts"}</h3>
            </div>
            <div aria-live="polite">
              <Badge className="text-[0.75rem]" variant={situation.tone}>
                {situation.label}
              </Badge>
            </div>
          </div>
          {stay ? (
            <dl className="mt-5 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              <Row label="Planned check-in">{localTime(stay.planned_checkin_at)}</Row>
              <Row label="Guest expected">
                {stay.arrival ? (
                  <>
                    <span className={cn(stay.early && "font-semibold text-[var(--warning)]")}>{localTime(stay.arrival.value)}</span>
                    <Source>
                      message at {localTime(stay.arrival.time)} · {producer(stay.arrival.source)}
                    </Source>
                  </>
                ) : (
                  <Muted>No arrival signal yet</Muted>
                )}
              </Row>
              <Row label="Housekeeping status (authority)">
                {stay.housekeeping ? (
                  <>
                    <span className={cn("font-mono", stay.readiness === "ready" ? "text-[var(--success)]" : "text-[var(--warning)]")}>{stay.housekeeping.value}</span>
                    <Source>
                      {producer(stay.housekeeping.source)} · {localTime(stay.housekeeping.time)}
                    </Source>
                  </>
                ) : (
                  <Muted>No authoritative status yet</Muted>
                )}
              </Row>
              <Row label="Conflicting facts">
                {stay.conflicts.length ? (
                  stay.conflicts.map((conflict) => (
                    <span className="block" key={`${conflict.source}-${conflict.event_id}`}>
                      <span className="font-mono">{conflict.value}</span>
                      <Source>
                        {producer(conflict.source)} · {localTime(conflict.time)} · not authoritative
                      </Source>
                    </span>
                  ))
                ) : (
                  <Muted>None</Muted>
                )}
              </Row>
              <Row label="Latest task">
                {stay.latest_task ? (
                  <>
                    <span>{stay.latest_task.task_type} completed</span>
                    <Source>
                      {producer(stay.latest_task.source)} · {localTime(stay.latest_task.time)}
                    </Source>
                  </>
                ) : (
                  <Muted>None</Muted>
                )}
              </Row>
              <Row label="Readiness">{stay.readiness === "not_ready" ? "Not ready" : stay.readiness === "ready" ? "Ready" : "Unknown"}</Row>
            </dl>
          ) : (
            <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">
              {position === 0 ? "Deliver the first event, or play the whole scenario." : "A reservation is known, but no stay is expected yet."}
            </p>
          )}
        </Card>

        {note ? (
          <Card className="border-l-2 border-l-[var(--accent)] p-5">
            <p className="eyebrow">
              Delivery {note.delivery} · {note.checks}
            </p>
            <p className="mt-2 text-sm leading-6">{note.note}</p>
          </Card>
        ) : null}

        {panel ? (
          <div className="[&_pre]:max-h-[26rem] [&_pre]:overflow-y-auto">
            <CodePanel code={panel.code} label={panel.label} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t border-[var(--border)] pt-3">
      <dt className="text-xs text-[var(--muted-foreground)]">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function Source({ children }: { children: ReactNode }) {
  return <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">{children}</span>;
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-[var(--muted-foreground)]">{children}</span>;
}
