import { replayArrivalReadiness } from "@hos-ai/sdk/reference";
import type { Metadata } from "next";
import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHero } from "@/components/content/page-hero";
import { SectionFrame } from "@/components/content/section-frame";
import { SpecTable } from "@/components/content/spec-table";
import { ArrivalReplay } from "@/components/demo/arrival-replay";
import { producerLabels } from "@/components/demo/producer-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { pmsMappingCopy } from "@/lib/content/pms-mappings";
import { buildArrivalStream, mappingPath, type PmsMapping, pmsMappings } from "@/lib/hos/mappings/replay";

type Props = { params: Promise<{ pms: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return pmsMappings.map((pms) => ({ pms }));
}

const isPmsMapping = (value: string): value is PmsMapping => (pmsMappings as readonly string[]).includes(value);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pms } = await params;
  if (!isPmsMapping(pms)) return {};
  const { name, api } = pmsMappingCopy[pms];
  return {
    title: `${name} mapping: arrival readiness`,
    description: `The arrival-readiness scenario replayed with its PMS facts taken from ${api} payloads, through an experimental, unofficial ${name} to HOS Events 0.1 adapter.`,
  };
}

export default async function PmsMappingPage({ params }: Props) {
  const { pms } = await params;
  if (!isPmsMapping(pms)) notFound();
  const copy = pmsMappingCopy[pms];
  const { scenario, manifests, recording, stream } = buildArrivalStream(pms);
  const steps = replayArrivalReadiness(
    stream.map((fact) => fact.event),
    manifests,
    scenario.projection,
  );
  const labels = { ...producerLabels(manifests), [recording.adapter.source]: `PMS · ${copy.name}` };
  const notes = stream.map((fact, index) => {
    const delivery = index + 1;
    if (!fact.recorded) return { ...scenario.deliveries.find((item) => item.delivery === fact.corpusDelivery)!, delivery };
    return {
      delivery,
      checks: `From ${copy.name} delivery ${fact.recorded.delivery} · ${copy.eventLabel(fact.recorded.webhook as never)}`,
      note: fact.recorded.note,
    };
  });
  const origins = Object.fromEntries(
    stream.flatMap((fact, index) => {
      if (!fact.recorded) return [];
      const { webhook, webhook_verification, fetched } = fact.recorded;
      const payload = {
        webhook,
        ...(webhook_verification ? { webhook_verification } : {}),
        fetched: fetched.map(({ operation, response }) => ({ operation, response })),
      };
      return [[index + 1, { label: `Received from ${copy.name} · delivery ${fact.recorded.delivery}`, code: JSON.stringify(payload, null, 2) }]];
    }),
  );
  const pmsFacts = stream.filter((fact) => fact.recorded).length;
  const reconstructed = recording.deliveries.filter((delivery) => delivery.webhook_verification).length;
  const downloads = [
    {
      href: `${mappingPath(pms)}/arrival-readiness.json`,
      label: "arrival-readiness.json",
      text: `The ${recording.deliveries.length} ${copy.name} deliveries: webhooks, what the integration fetched for them, the adapter configuration and every documented difference.`,
    },
    {
      href: `${mappingPath(pms)}/README.md`,
      label: "README.md",
      text: "Field-by-field mapping, its sources and limits, and what it taught us about HOS 0.1.",
    },
  ];

  return (
    <>
      <PageHero
        eyebrow="Mapping · Experimental"
        title={copy.title}
        description={`The PMS side of the arrival scenario now starts as ${copy.api} payloads. ${copy.description} A reference adapter turns them into ${pmsFacts} HOS facts, and the projection reaches the same outcome as the synthetic corpus.`}
        badge={`${copy.api} → HOS Events 0.1 · Unofficial · Synthetic data`}
      />
      <section className="mx-auto max-w-6xl px-5 pb-10 lg:px-8">
        <div className="border-l-2 border-[var(--warning)] bg-[var(--warning-soft)] p-5 text-sm leading-7 text-[var(--muted-foreground)]">
          <p className="font-semibold text-[var(--foreground)]">Unofficial and experimental.</p>
          <p className="mt-1">
            Written from {copy.name}&apos;s published documentation and packages, listed below. HOS AI is not affiliated with {copy.name}, and{" "}
            {copy.name} has not reviewed or endorsed this mapping. Every payload is synthetic
            {copy.liveCheck ? `. ${copy.liveCheck}` : `, and the adapter has not yet run against a live ${copy.name} environment.`}
            {reconstructed ? ` ${reconstructed} webhook payloads are reconstructed, and each says so.` : null}
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 pb-16 lg:px-8">
        <ArrivalReplay
          notes={notes}
          origins={origins}
          producerLabels={labels}
          stayId="stay_1042"
          steps={steps}
          timezone={scenario.property.timezone}
        />
        <p className="mt-6 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
          {steps.length} facts for the scenario&apos;s {scenario.deliveries.length}.{" "}
          {recording.not_reproduced.map((item) => `Delivery ${item.delivery} has no ${copy.name} counterpart.`).join(" ")}
          {recording.additions.map((item) => ` ${copy.name} adds a fact the corpus does not have. ${item.reason}`).join("")} Housekeeping and
          messaging facts are unchanged. Times are shown in the property time zone ({scenario.property.timezone}).
        </p>
      </section>
      <SectionFrame
        eyebrow="Mapping"
        title={`From ${copy.name} payloads to HOS facts.`}
        description="The adapter never forwards a PMS payload. It compares each fetched entity with what it already published and emits only the facts that changed, with ids that stay the same when a webhook is delivered again."
      >
        <SpecTable
          columns={[`${copy.name} event`, "When", "HOS Events 0.1", "How"]}
          label={`${copy.name} to HOS Events 0.1 mapping`}
          minWidth="56rem"
          rows={copy.mapping.map(([event, when, hos, how]) => ({
            key: `${event} ${when}`,
            cells: [
              event,
              when,
              <span className="font-mono text-xs text-[var(--foreground)]" key="hos">
                {hos}
              </span>,
              how,
            ],
          }))}
        />
      </SectionFrame>
      <SectionFrame
        eyebrow="Findings"
        title={`What ${copy.name} taught us about HOS 0.1.`}
        description="Mapping a real PMS is the test the synthetic corpus could not provide. These are the gaps it exposed, in the source and in the specification."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {copy.findings.map(([title, text]) => (
            <Card className="p-5" key={title}>
              <h3 className="font-medium">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p>
            </Card>
          ))}
        </div>
      </SectionFrame>
      <SectionFrame
        eyebrow="Mapping kit"
        title="Check the mapping yourself."
        description="The recording pins the PMS payloads, the adapter configuration and every difference from the synthetic corpus. The unit tests replay it and compare the outcome with the scenario's expected.json."
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
        <h3 className="mt-10 font-medium">Sources</h3>
        <ul className="mt-3 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {recording.sources.map((source) => (
            <li className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-start" key={source.url}>
              <div>
                <a
                  className="text-sm font-medium underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-[var(--accent)]"
                  href={source.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {source.label}
                  {source.revision ? ` · ${source.revision.length > 12 ? source.revision.slice(0, 7) : source.revision}` : null}
                </a>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">{source.covers}</p>
              </div>
              <Badge variant={source.official ? "active" : "default"}>{source.official ? `By ${copy.name}` : "Third party"}</Badge>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/demo#pms-mappings">
            <Button variant="secondary">
              <ArrowLeft aria-hidden="true" size={16} /> Compare the three PMS mappings
            </Button>
          </Link>
          <Link href="/participate/pilot">
            <Button variant="secondary">Run this mapping on your property</Button>
          </Link>
        </div>
      </SectionFrame>
    </>
  );
}
