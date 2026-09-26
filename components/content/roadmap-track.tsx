import { Check, LockKeyhole, ScanSearch, Sparkles, Waypoints } from "lucide-react";

import { Badge } from "@/components/ui/badge";

const phases = [
  {
    title: "Observe",
    icon: ScanSearch,
    state: "Now",
    text: "Spot problems: shared updates with clear sources, and alerts such as a room not ready for an arrival.",
  },
  {
    title: "Act",
    icon: Waypoints,
    state: "Later",
    text: "Act within the hotel's rules: assign a room, move a cleaning task up the list, message a guest.",
  },
  {
    title: "Trust",
    icon: LockKeyhole,
    state: "Later",
    text: "Written, versioned rules, approvals, a record of every action and clear limits on what each tool may do.",
  },
  { title: "Agents", icon: Sparkles, state: "Later", text: "AI agents that state what they do and offer the same guarantees in every hotel." },
  { title: "Ecosystem", icon: Check, state: "Later", text: "Certified connectors and a voluntary community of systems that work together." },
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
