import type { Metadata } from "next";
import { Download } from "lucide-react";
import Link from "next/link";

import { CodePanel } from "@/components/content/code-panel";
import { PageHero } from "@/components/content/page-hero";
import { SectionFrame } from "@/components/content/section-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { loadArrivalScenario, scenarioPath, specVersionPath } from "@/lib/hos/conformance";
import eventSchema from "@/public/spec/0.1/schemas/hos-event.schema.json";

export const metadata: Metadata = {
  title: "HOS Core 0.1 (draft)",
  description: "The first public draft of the HOS operating contract: Core entities, CloudEvents-compatible facts with provenance, producer authority, processing rules and the arrival-readiness projection.",
};

type SchemaNode = { description?: string; title?: string; required?: string[]; properties?: Record<string, SchemaNode>; "x-hos-entity"?: string; "x-hos-authority"?: string };

const envelope = eventSchema as unknown as SchemaNode & { $defs: Record<string, SchemaNode> };
const eventTypes = Object.entries(envelope.$defs).filter(([, definition]) => definition["x-hos-entity"]);

const entities = [
  ["Property", "The tenant boundary. Every fact carries its property, time zone and business date."],
  ["Unit", "A sellable space. Its status is tracked per dimension: housekeeping, occupancy, maintenance."],
  ["Reservation", "The commercial booking, as held by the reservation system."],
  ["Stay", "The operational visit: expected unit, planned check-in and arrival signals."],
  ["Task", "Operational work on a unit. Completing a task is a fact of its own, not a status change."],
  ["Guest", "A pseudonymous reference only. No name, email address, phone or loyalty number."],
  ["Message", "A reference only. Signals are extracted; message content stays in the messaging system."],
];

const processingRules = [
  ["Identity", "A fact is identified by source and id. A redelivered fact is a duplicate and is ignored."],
  ["Occurrence order", "For the same subject, the fact with the latest time wins; equal times fall back to source, then id. Delivery order never decides."],
  ["Declared authority", "Only facts from the producer declared authoritative in its manifest change a projected value. Facts from producers without a manifest are ignored."],
  ["Visible conflicts", "A non-authoritative value that disagrees with the authoritative value, and is not older than it, is reported as a conflict. HOS never merges it into a single truth."],
  ["Minimal data", "Data objects are closed. People appear only as pseudonymous references, and message content never enters HOS."],
];

export default function CoreSpecificationPage() {
  const { events, scenario } = loadArrivalScenario();
  const example = JSON.stringify(events[2], null, 2);

  return (
    <>
      <PageHero
        eyebrow="Documentation · HOS Core"
        title="HOS Core 0.1"
        description="The first public draft of the HOS operating contract: a small Core, CloudEvents-compatible facts with provenance, authority declared by each producer, and one observable projection you can replay."
        badge="Draft · Observe"
      />
      <section className="mx-auto max-w-6xl px-5 lg:px-8">
        <div className="border-l-2 border-[var(--warning)] bg-[var(--warning-soft)] p-5 text-sm leading-7 text-[var(--muted-foreground)]">
          <p className="font-semibold text-[var(--foreground)]">Draft for review.</p>
          <p className="mt-1">
            Names and fields may change before 0.1 is final. The specification is intended for publication under CC BY 4.0. Every example is synthetic. Comments and counter-proposals are welcome through the{" "}
            <Link className="text-[var(--accent-strong)] underline" href="/participate/technical-contributor">
              technical contributor path
            </Link>
            .
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/demo">
            <Button>Replay the scenario</Button>
          </Link>
          <a download href={`${specVersionPath}/schemas/hos-event.schema.json`}>
            <Button variant="secondary">
              <Download aria-hidden="true" size={15} /> Event schema
            </Button>
          </a>
          <a download href={`${specVersionPath}/schemas/producer-manifest.schema.json`}>
            <Button variant="secondary">
              <Download aria-hidden="true" size={15} /> Manifest schema
            </Button>
          </a>
        </div>
      </section>

      <SectionFrame eyebrow="Scope" title="What 0.1 covers, and what it deliberately leaves out.">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-6">
            <Badge variant="active">In 0.1</Badge>
            <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">Seven Core entities, five fact types, Event Producer manifests, processing rules and the arrival-readiness projection with its conformance scenario.</p>
          </Card>
          <Card className="p-6">
            <Badge>Not yet</Badge>
            <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">Commands and actions, approval policies, agent manifests, manifest signing, certification. They open only when the evidence supports them.</p>
          </Card>
          <Card className="p-6">
            <Badge variant="success">Always</Badge>
            <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">Event-first, no required broker or central database, authority declared rather than assumed, minimal pseudonymous data.</p>
          </Card>
        </div>
      </SectionFrame>

      <SectionFrame eyebrow="Core entities" title="Seven entities, each with a narrow meaning.">
        <dl className="grid gap-px overflow-hidden border border-[var(--border)] bg-[var(--border)] sm:grid-cols-2">
          {entities.map(([name, text]) => (
            <div className="bg-[var(--card)] p-5 sm:last:odd:col-span-2" key={name}>
              <dt className="font-mono text-sm">{name}</dt>
              <dd className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{text}</dd>
            </div>
          ))}
        </dl>
      </SectionFrame>

      <SectionFrame id="envelope" eyebrow="Event envelope" title="Every fact is a CloudEvent with HOS provenance." description="HOS uses CloudEvents 1.0 in structured JSON mode and adds lower-case extension attributes for business time, time zone, property and causal links.">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div aria-label="Event envelope attributes" className="overflow-x-auto border border-[var(--border)]" role="region" tabIndex={0}>
            <table className="w-full min-w-[32rem] text-left text-sm">
              <caption className="sr-only">HOS event envelope attributes</caption>
              <thead className="bg-[var(--muted)] text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium" scope="col">Attribute</th>
                  <th className="px-4 py-3 font-medium" scope="col">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(envelope.properties ?? {}).map(([name, property]) => (
                  <tr className="border-t border-[var(--border)] align-top" key={name}>
                    <th className="whitespace-nowrap px-4 py-3 font-mono text-xs font-normal" scope="row">
                      {name}
                      {envelope.required?.includes(name) ? null : <span className="ml-2 text-[var(--muted-foreground)]">optional</span>}
                    </th>
                    <td className="px-4 py-3 leading-6 text-[var(--muted-foreground)]">{property.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="min-w-0">
            <CodePanel code={example} label="unit.status_changed · synthetic" />
          </div>
        </div>
      </SectionFrame>

      <SectionFrame id="events" eyebrow="Event types" title="Five facts and two situations for the arrival scenario.">
        <div aria-label="Event types" className="overflow-x-auto border border-[var(--border)]" role="region" tabIndex={0}>
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">HOS 0.1 event types</caption>
            <thead className="bg-[var(--muted)] text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-4 py-3 font-medium" scope="col">Type</th>
                <th className="px-4 py-3 font-medium" scope="col">Entity · authority</th>
                <th className="px-4 py-3 font-medium" scope="col">Required data</th>
                <th className="px-4 py-3 font-medium" scope="col">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {eventTypes.map(([type, definition]) => (
                <tr className="border-t border-[var(--border)] align-top" key={type}>
                  <th className="whitespace-nowrap px-4 py-3 font-mono text-xs font-normal" scope="row">{type}</th>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">
                    {definition["x-hos-entity"]}
                    <span className="block text-xs">{definition["x-hos-authority"]}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs leading-6 text-[var(--muted-foreground)]">{definition.required?.join(", ")}</td>
                  <td className="px-4 py-3 leading-6 text-[var(--muted-foreground)]">{definition.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionFrame>

      <SectionFrame id="manifests" eyebrow="Authority" title="Each producer declares what it knows, and what it is the source of truth for." description="An Event Producer manifest lists the events a system emits for which properties, whether it is authoritative for each, its delivery guarantee and ordering, its replay window and its retention.">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["One authority", "At most one producer is authoritative for a given property, event type and dimension. A PMS can mirror housekeeping status without being its authority."],
            ["Declared, not claimed", "The authority field inside a fact is informative. Whether HOS treats a value as authoritative is decided by the manifests only."],
            ["Signing in progress", "Manifest signing is reserved in the schema and will be specified before any action capability opens."],
          ].map(([title, text]) => (
            <Card className="p-6" key={title}>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p>
            </Card>
          ))}
        </div>
        <p className="mt-6 text-sm">
          <a className="text-[var(--accent-strong)] underline" download href={`${scenarioPath}/${scenario.files.producers[0]}`}>
            Example: the synthetic PMS manifest
          </a>
        </p>
      </SectionFrame>

      <SectionFrame id="processing" eyebrow="Processing rules" title="Five rules every consumer applies the same way.">
        <ol className="grid gap-3">
          {processingRules.map(([title, text], index) => (
            <li className="grid gap-2 border border-[var(--border)] bg-[var(--card)] p-5 sm:grid-cols-[12rem_1fr]" key={title}>
              <p className="font-semibold">
                <span className="mr-2 font-mono text-xs text-[var(--accent)]">0{index + 1}</span>
                {title}
              </p>
              <p className="text-sm leading-6 text-[var(--muted-foreground)]">{text}</p>
            </li>
          ))}
        </ol>
      </SectionFrame>

      <SectionFrame id="projection" eyebrow="Arrival-readiness projection" title="A risk is raised when an early guest meets a unit that is not ready.">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <h3 className="font-semibold">When the risk is raised</h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted-foreground)]">
              <li>The reservation is confirmed or tentative.</li>
              <li>The latest arrival signal is earlier than the planned check-in.</li>
              <li>The authoritative housekeeping status of the assigned unit is not one of the property&apos;s ready statuses ({scenario.projection.ready_housekeeping_statuses.join(", ")} in the scenario), or is unknown.</li>
            </ul>
          </Card>
          <Card className="p-6">
            <h3 className="font-semibold">What is emitted</h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted-foreground)]">
              <li>
                <span className="font-mono text-xs">arrival.room_readiness_at_risk</span> when the condition starts to hold, with the authoritative status, conflicts, latest task and evidence.
              </li>
              <li>
                <span className="font-mono text-xs">arrival.room_readiness_resolved</span> when it stops holding, with the reason: unit ready, arrival no longer early, or reservation inactive.
              </li>
              <li>Situations are emitted on transitions only. Their time is the time of their latest supporting fact. HOS 0.1 never acts on them.</li>
            </ul>
          </Card>
        </div>
      </SectionFrame>

      <SectionFrame id="conformance" eyebrow="Conformance" title="Prove an implementation against the same nine deliveries." description="The arrival-readiness scenario covers a duplicate delivery, a conflicting non-authoritative status, an out-of-order message and a resolution. An implementation conforms when it reproduces expected.json.">
        <div className="flex flex-wrap gap-3">
          <Link href="/demo">
            <Button>Open the live demo and downloads</Button>
          </Link>
          <Link href="/participate/pilot">
            <Button variant="secondary">Validate it on your own systems</Button>
          </Link>
        </div>
      </SectionFrame>
    </>
  );
}
