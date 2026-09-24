import type { Metadata } from "next";
import { Download } from "lucide-react";
import Link from "next/link";

import { PageHero } from "@/components/content/page-hero";
import { SectionFrame } from "@/components/content/section-frame";
import { ArrivalReplay } from "@/components/demo/arrival-replay";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { loadArrivalScenario, scenarioPath, specVersionPath } from "@/lib/hos/conformance";
import { replayArrivalReadiness } from "@/lib/hos/projection";

export const metadata: Metadata = {
  title: "Live demo: arrival readiness",
  description: "Replay nine synthetic facts from a PMS, a housekeeping system and guest messaging, and watch HOS 0.1 detect, then resolve, an early-arrival room-readiness risk.",
};

const roleLabels: Record<string, string> = { pms: "PMS", housekeeping: "Housekeeping", messaging: "Messaging", maintenance: "Maintenance", other: "Other" };

export default function DemoPage() {
  const { scenario, manifests, events } = loadArrivalScenario();
  const steps = replayArrivalReadiness(events, manifests, scenario.projection);
  const producerLabels = Object.fromEntries(manifests.map((manifest) => [manifest.producer, roleLabels[manifest.system_role]]));
  const downloads = [
    { href: `${scenarioPath}/${scenario.files.events}`, label: "events.jsonl", text: "The nine deliveries, in delivery order, one CloudEvent per line." },
    { href: `${scenarioPath}/${scenario.files.expected}`, label: "expected.json", text: "Dispositions, readiness and situations your implementation must reproduce." },
    { href: `${scenarioPath}/scenario.json`, label: "scenario.json", text: "Property profile, readiness rule and what each delivery checks." },
    ...scenario.files.producers.map((file) => ({ href: `${scenarioPath}/${file}`, label: file, text: "Event Producer manifest: declared events, authority, delivery, replay and retention." })),
    { href: `${specVersionPath}/schemas/hos-event.schema.json`, label: "hos-event.schema.json", text: "JSON Schema (2020-12) for every HOS 0.1 event and situation." },
  ];

  return (
    <>
      <PageHero
        eyebrow="Live demo"
        title="Replay an early arrival, one fact at a time."
        description="A PMS, a housekeeping system and a guest messaging platform send nine facts about one stay. Watch HOS ignore a duplicate, keep a conflicting status visible, set aside a late message, and raise a room-readiness risk before the guest walks in."
        badge="HOS 0.1 · Observe · Synthetic data"
      />
      <section className="mx-auto max-w-6xl px-5 pb-16 lg:px-8">
        <ArrivalReplay notes={scenario.deliveries} producerLabels={producerLabels} stayId="stay_1042" steps={steps} timezone={scenario.property.timezone} />
        <p className="mt-6 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
          Times are shown in the property time zone ({scenario.property.timezone}). HOS 0.1 only observes: it does not reassign the room, message the guest or change the booking. The projection on this page is the reference implementation run against the published files below.
        </p>
      </section>
      <SectionFrame
        eyebrow="Conformance kit"
        title="Run the same scenario through your own system."
        description="Replay events.jsonl in file order through your implementation, then compare its dispositions, readiness and situations with expected.json. Everything is synthetic; no guest or operational data is involved."
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
          <Link href="/docs/core">
            <Button>Read HOS Core 0.1</Button>
          </Link>
          <Link href="/participate/pilot">
            <Button variant="secondary">Run this scenario with your systems</Button>
          </Link>
        </div>
      </SectionFrame>
    </>
  );
}
