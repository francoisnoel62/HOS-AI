import type { Metadata } from "next";
import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";

import { PageHero } from "@/components/content/page-hero";
import { SectionFrame } from "@/components/content/section-frame";
import { SpecTable } from "@/components/content/spec-table";
import { ArrivalReplay } from "@/components/demo/arrival-replay";
import { producerLabels } from "@/components/demo/producer-labels";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { buildMewsArrivalStream, mewsMappingPath } from "@/lib/hos/mappings/mews-replay";
import { replayArrivalReadiness } from "@/lib/hos/projection";

export const metadata: Metadata = {
  title: "Mews mapping: arrival readiness",
  description: "The arrival-readiness scenario replayed with its PMS facts taken from Mews Connector API webhook messages and fetched reservations and resources, through an experimental, unofficial Mews to HOS Events 0.1 adapter.",
};

const mapping = [
  ["ServiceOrderUpdated", "First seen Optional or Confirmed", "reservation.created, stay.expected", "time is CreatedUtc. The confirmation Number and the reservation Id become typed external references; AccountId becomes a pseudonymous guest_id through the crosswalk."],
  ["ServiceOrderUpdated", "Inquired or Requested", "Nothing yet", "Not a commitment: published once the reservation becomes Optional or Confirmed."],
  ["ServiceOrderUpdated", "State, schedule or owner changed", "reservation.updated, stay.expected", "Only the changed fields travel, at UpdatedUtc. The stay is announced again when its planned times move."],
  ["ServiceOrderUpdated", "AssignedResourceId changed", "stay.unit_assigned", "previous_unit_id is the unit already published; the reason is known only for the first assignment. time is UpdatedUtc."],
  ["ServiceOrderUpdated", "Started", "stay.checked_in", "time is ActualStartUtc, the actual arrival."],
  ["ServiceOrderUpdated", "Processed", "stay.checked_out", "time is ActualEndUtc. A check-in the adapter missed is published first."],
  ["ServiceOrderUpdated", "Canceled", "reservation.cancelled, or reservation.updated", "CancellationReason NoShow becomes status no_show; the other reasons map to guest_request, property_request, payment_issue or other."],
  ["ResourceUpdated", "Dirty, Clean, Inspected", "unit.status_changed · housekeeping", "time is UpdatedUtc; previous only when the adapter saw it. The manifest, not the adapter, decides whether the PMS is authoritative."],
  ["ResourceUpdated", "OutOfService, OutOfOrder", "unit.status_changed · maintenance", "out_of_service; leaving it publishes operational, then the housekeeping state."],
  ["Other events", "CustomerAdded, CustomerUpdated, MessageAdded, PaymentUpdated, ResourceBlockUpdated", "Not mapped", "Profiles stay in Mews; an arrival signal must be extracted from a message; the others have no HOS 0.1 counterpart yet."],
];

const findings = [
  ["Webhooks say what changed, not how.", "Mews sends entity ids only. The adapter fetches each entity and compares it with what it already published, so its memory is part of the integration and must be persisted."],
  ["A stay has no expected moment in Mews.", "The stay is published with the reservation, at CreatedUtc; hosbusinessdate keeps the arrival day. HOS Events could say when stay.expected is due."],
  ["HOS 0.1 cannot remove an assignment.", "stay.unit_assigned requires a unit, and Mews can unassign one. The adapter reports it as unmapped. HOS needs a nullable unit or an unassignment event."],
  ["One Mews state, four HOS dimensions.", "OutOfOrder replaces the housekeeping state in Mews. HOS keeps both dimensions; the source simply stops reporting one of them."],
  ["Occurrence times are approximate.", "Assignments and room states only carry the entity's last update, UpdatedUtc: an upper bound when several changes arrive in one fetch."],
  ["Provenance stops at the PMS.", "Mews does not say who changed a room state, why, what it was before or what caused it. The manifest's authority rule is what keeps a mirrored status from overriding the housekeeping system."],
  ["Tasks are out of reach.", "There is no task webhook, and a Mews task points to a reservation, not a room. This integration publishes no housekeeping tasks."],
];

export default function MewsDemoPage() {
  const { scenario, manifests, recording, stream } = buildMewsArrivalStream();
  const steps = replayArrivalReadiness(
    stream.map((fact) => fact.event),
    manifests,
    scenario.projection,
  );
  const labels = { ...producerLabels(manifests), [recording.adapter.source]: "PMS · Mews" };
  const notes = stream.map((fact, index) => {
    const delivery = index + 1;
    if (!fact.mews) return { ...scenario.deliveries.find((item) => item.delivery === fact.corpusDelivery)!, delivery };
    return { delivery, checks: `From Mews delivery ${fact.mews.delivery} · ${fact.mews.webhook.Events.map((event) => event.Discriminator).join(", ")}`, note: fact.mews.note };
  });
  const origins = Object.fromEntries(
    stream.flatMap((fact, index) =>
      fact.mews
        ? [[index + 1, { label: `Received from Mews · delivery ${fact.mews.delivery}`, code: JSON.stringify({ webhook: fact.mews.webhook, fetched: fact.mews.fetched.map(({ operation, response }) => ({ operation, response })) }, null, 2) }]]
        : [],
    ),
  );
  const pmsFacts = stream.filter((fact) => fact.mews).length;
  const downloads = [
    { href: `${mewsMappingPath}/arrival-readiness.json`, label: "arrival-readiness.json", text: `The ${recording.deliveries.length} Mews deliveries: webhook messages, the reservations and resources fetched for them, the adapter configuration and every documented difference.` },
    { href: `${mewsMappingPath}/README.md`, label: "README.md", text: "Field-by-field mapping, its limits and what it taught us about HOS 0.1." },
  ];

  return (
    <>
      <PageHero
        eyebrow="Mapping · Experimental"
        title="The same early arrival, with the PMS speaking Mews."
        description={`The PMS side of the arrival scenario now starts as Mews Connector API payloads: webhook messages that carry only ids, then the reservation and room the integration fetches. A reference adapter turns them into ${pmsFacts} HOS facts, and the projection reaches the same outcome as the synthetic corpus.`}
        badge="Mews Connector API → HOS Events 0.1 · Unofficial · Synthetic data"
      />
      <section className="mx-auto max-w-6xl px-5 pb-10 lg:px-8">
        <div className="border-l-2 border-[var(--warning)] bg-[var(--warning-soft)] p-5 text-sm leading-7 text-[var(--muted-foreground)]">
          <p className="font-semibold text-[var(--foreground)]">Unofficial and experimental.</p>
          <p className="mt-1">
            Written from Mews&apos;s public Connector API documentation (revision {recording.documentation.revision.slice(0, 7)}). HOS AI is not affiliated with Mews, and Mews has not reviewed or endorsed this mapping. Every payload is synthetic, and the adapter has not yet run against a live Mews environment.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 pb-16 lg:px-8">
        <ArrivalReplay notes={notes} origins={origins} producerLabels={labels} stayId="stay_1042" steps={steps} timezone={scenario.property.timezone} />
        <p className="mt-6 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
          {steps.length} facts instead of {scenario.deliveries.length}: Mews has no task webhook, so the PMS task of the synthetic scenario has no Mews counterpart. Housekeeping and messaging facts are unchanged. Times are shown in the property time zone ({scenario.property.timezone}).
        </p>
      </section>
      <SectionFrame eyebrow="Mapping" title="From Mews payloads to HOS facts." description="The adapter never forwards a Mews payload. It compares each fetched entity with what it already published and emits only the facts that changed, with ids that stay the same when Mews retries a webhook.">
        <SpecTable
          columns={["Mews event", "When", "HOS Events 0.1", "How"]}
          label="Mews to HOS Events 0.1 mapping"
          minWidth="56rem"
          rows={mapping.map(([mews, when, hos, how]) => ({ key: `${mews} ${when}`, cells: [mews, when, <span className="font-mono text-xs text-[var(--foreground)]" key="hos">{hos}</span>, how] }))}
        />
      </SectionFrame>
      <SectionFrame eyebrow="Findings" title="What a real API taught us about HOS 0.1." description="Mapping a real PMS is the test the synthetic corpus could not provide. These are the gaps it exposed, in the source and in the specification.">
        <div className="grid gap-3 md:grid-cols-2">
          {findings.map(([title, text]) => (
            <Card className="p-5" key={title}>
              <h3 className="font-medium">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p>
            </Card>
          ))}
        </div>
      </SectionFrame>
      <SectionFrame eyebrow="Mapping kit" title="Check the mapping yourself." description="The recording pins the Mews payloads, the adapter configuration and every difference from the synthetic corpus. The unit tests replay it and compare the outcome with the scenario's expected.json.">
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
          <Link href="/demo">
            <Button variant="secondary">
              <ArrowLeft aria-hidden="true" size={16} /> Back to the synthetic replay
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
