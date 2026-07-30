import { Check, LockKeyhole, ScanSearch, Sparkles, Waypoints } from "lucide-react";

import { Badge } from "@/components/ui/badge";

const phases = [
  { title: "Observe", icon: ScanSearch, state: "Now", text: "Events, provenance, capabilities and a replayable arrival-readiness projection." },
  { title: "Act", icon: Waypoints, state: "Later", text: "Policy-controlled commands for unit assignment, task reprioritisation and guest messaging." },
  { title: "Trust", icon: LockKeyhole, state: "Later", text: "Versioned policies, approval, audit evidence and bounded operational permissions." },
  { title: "Agents", icon: Sparkles, state: "Later", text: "Responsible agent manifests and portable operational guarantees." },
  { title: "Ecosystem", icon: Check, state: "Later", text: "Certified profiles, mappings and an opt-in community of interoperable systems." },
];

export function RoadmapTrack() {
  return (
    <ol className="grid gap-3 lg:grid-cols-5">
      {phases.map((phase, index) => {
        const Icon = phase.icon;
        return (
          <li className="relative rounded-lg border border-[var(--border)] bg-[var(--card)] p-5" key={phase.title}>
            <div className="flex items-center justify-between">
              <Icon aria-hidden="true" size={19} className={index === 0 ? "text-[var(--accent)]" : "text-[var(--muted-foreground)]"} />
              <Badge variant={index === 0 ? "active" : "default"}>{phase.state}</Badge>
            </div>
            <h3 className="mt-6 text-lg font-semibold tracking-[-0.04em]">{phase.title}</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{phase.text}</p>
          </li>
        );
      })}
    </ol>
  );
}
