import { Download } from "lucide-react";
import Link from "next/link";

import { SectionFrame } from "@/components/content/section-frame";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type ConformanceScenarioId, loadScenario, scenarioPath, specVersionPath } from "@/lib/hos/conformance";

// The published files of one conformance scenario, to replay through another implementation.
export function ConformanceKit({ id }: { id: ConformanceScenarioId }) {
  const { scenario, events } = loadScenario(id);
  const path = scenarioPath(id);
  const downloads = [
    { href: `${path}/${scenario.files.events}`, label: "events.jsonl", text: `The ${events.length} deliveries, in delivery order, one CloudEvent per line.` },
    { href: `${path}/${scenario.files.expected}`, label: "expected.json", text: "Dispositions, readiness and situations your implementation must reproduce." },
    { href: `${path}/scenario.json`, label: "scenario.json", text: "Tenant and property profile, readiness rule, the cases covered and what each delivery checks." },
    ...scenario.files.producers.map((file) => ({ href: `${path}/${file}`, label: file, text: "Event Producer manifest: declared events, authority, delivery, replay and retention." })),
    { href: `${specVersionPath}/schemas/events.schema.json`, label: "events.schema.json", text: "JSON Schema (2020-12) for the fifteen HOS Events 0.1 types, with the envelope and Core schemas it references." },
    { href: `${specVersionPath}/schemas/reference/arrival-readiness.schema.json`, label: "reference/arrival-readiness.schema.json", text: "Non-normative schema of the two reference situations." },
  ];

  return (
    <SectionFrame
      eyebrow="Conformance kit"
      title="Run the same scenario through your own system."
      description="For technical teams: feed these files to your own system and check that it reaches the same result. Replay events.jsonl in file order, then compare its dispositions, readiness and situations with expected.json. All the data is made up; no guest or operational data is involved."
    >
      <div className="grid gap-3 md:grid-cols-2">
        {downloads.map((item) => (
          <a className="group" download href={item.href} key={item.href}>
            <Card className="flex h-full items-start gap-3 p-4 transition-colors group-hover:border-[var(--border-strong)]">
              <Download aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--accent)]" size={16} />
              <span>
                <span className="block font-mono text-sm">{item.label}</span>
                <span className="mt-1 block text-sm leading-6 text-[var(--muted-foreground)]">{item.text}</span>
              </span>
            </Card>
          </a>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/docs/events">
          <Button>Read HOS Events 0.1</Button>
        </Link>
        <Link href="/participate/pilot">
          <Button variant="secondary">Run this scenario with your systems</Button>
        </Link>
      </div>
    </SectionFrame>
  );
}
