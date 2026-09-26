import { Check, CircleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export { EventFlowDiagram } from "./arrival-story";

export function ReadinessRiskCard() {
  return (
    <aside aria-label="Example alert" className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-5">
      <div className="flex items-start gap-3">
        <CircleAlert aria-hidden="true" className="mt-0.5 text-[var(--warning)]" size={20} />
        <div>
          <Badge variant="warning">Alert</Badge>
          <h3 className="mt-3 text-lg font-semibold tracking-[-0.04em]">Room 204 may not be ready in time</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
            The guest has written that they will arrive early, and the room has been cleaned but not inspected. The front desk sees it now, with where
            each piece of information came from, not when the guest is at the desk.
          </p>
          <div className="mt-4 flex items-center gap-2 font-mono text-xs">
            <Check aria-hidden="true" size={14} /> HOS alerts. Your team decides.
          </div>
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
