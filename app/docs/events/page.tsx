import type { Metadata } from "next";
import { Download } from "lucide-react";
import Link from "next/link";

import { CodePanel } from "@/components/content/code-panel";
import { DraftNotice } from "@/components/content/draft-notice";
import { PageHero } from "@/components/content/page-hero";
import { SectionFrame } from "@/components/content/section-frame";
import { SpecTable } from "@/components/content/spec-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { scenarioDemos } from "@/lib/content/scenarios";
import { conformanceScenarios, examplesPath, loadArrivalScenario, loadScenario, scenarioPath, specVersionPath } from "@/lib/hos/conformance";
import envelopeSchema from "@/public/spec/0.1/schemas/event-envelope.schema.json";
import eventsSchema from "@/public/spec/0.1/schemas/events.schema.json";

export const metadata: Metadata = {
  title: "HOS Events 0.1 (draft)",
  description: "Immutable, CloudEvents-compatible HOS events: the envelope profile, fifteen event types in five families, snapshots, delivery, deduplication, ordering and replay.",
};

type SchemaNode = { title?: string; description?: string; required?: string[]; properties?: Record<string, SchemaNode>; "x-hos-family"?: string; "x-hos-authority"?: string };

const envelope = envelopeSchema as unknown as SchemaNode;
const catalogue = Object.entries((eventsSchema as unknown as { $defs: Record<string, SchemaNode> }).$defs);

const principles = [
  ["Immutable facts", "An event records what happened. A correction, a released unit, a reverted check-in or a withdrawn maintenance window is a new event; nothing is edited in place."],
  ["Named for meaning", "Types are domain.resource.past_tense, singular and vendor-neutral: housekeeping.task.completed, not a vendor's webhook name."],
  ["One dimension at a time", "A status change states only the changed dimension, the previous value when known, the new value, the authority source and an optional reason."],
  ["Explicit snapshots", "A snapshot is sent only when deltas cannot recover the state. It is declared in hosdatamode, allowed by the producer's manifest and sensitivity-classified."],
  ["Plans are not states", "unit.maintenance_scheduled plans when a unit will be out of service or out of sale. The unit's statuses change only through unit.status_changed, when the window begins."],
  ["Honest time and actor", "time is when the fact occurred. When the source only knows the entity's last modification, hostimebasis says modified; when it knows nothing, recorded. hosactor names who acted, pseudonymously, when the source knows."],
];

const deliveryRules = [
  ["At-least-once delivery", "The same event can arrive more than once. Consumers deduplicate on source + id."],
  ["No global order", "Ordering holds only when a producer declares it, per subject or in total. Otherwise consumers order by time, then source, then id; delivery order never decides."],
  ["Declared capability", "A consumer processes only what the producer's manifest declares for the property. Undeclared means denied."],
  ["Source authority", "Only the declared system of record changes a value. Other facts are recorded and shown as conflicts, never merged into a single truth."],
  ["Replay", "Producers declare replay support and retention. Replays are JSON Lines, one event per line; a certified Event Producer profile provides at least 30 days."],
  ["Minimal data", "Data objects are closed. People appear only as pseudonymous references, message content never enters HOS, and vendor detail lives in namespaced extensions."],
];

const numberWords = ["no", "one", "two", "three", "four", "five", "six"];

export default function EventsSpecificationPage() {
  const { events, scenario } = loadArrivalScenario();
  const corpora = conformanceScenarios.map((id) => ({ id, ...loadScenario(id) }));
  const deliveries = corpora.reduce((total, corpus) => total + corpus.events.length, 0);

  return (
    <>
      <PageHero
        eyebrow="Documentation · HOS Events"
        title="HOS Events 0.1"
        description="Immutable, CloudEvents-compatible records of what happened in hospitality operations: one envelope profile, fifteen event types in five families, and the delivery rules every producer and consumer share."
        badge="Draft · Observe"
      />
      <section className="mx-auto max-w-6xl px-5 lg:px-8">
        <DraftNotice />
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/demo">
            <Button>Replay the arrival scenario</Button>
          </Link>
          {[
            ["events.schema.json", "Events schema"],
            ["event-envelope.schema.json", "Envelope schema"],
            ["producer-manifest.schema.json", "Manifest schema"],
          ].map(([file, label]) => (
            <a download href={`${specVersionPath}/schemas/${file}`} key={file}>
              <Button variant="secondary">
                <Download aria-hidden="true" size={15} /> {label}
              </Button>
            </a>
          ))}
        </div>
      </section>

      <SectionFrame eyebrow="Principles" title="Facts before intentions.">
        <div className="grid gap-4 md:grid-cols-2">
          {principles.map(([title, text]) => (
            <Card className="p-6" key={title}>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p>
            </Card>
          ))}
        </div>
      </SectionFrame>

      <SectionFrame id="envelope" eyebrow="Envelope profile" title="Every event is a CloudEvent with HOS context." description={envelope.description}>
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <SpecTable
            columns={["Attribute", "Meaning"]}
            label="HOS event envelope attributes"
            rows={Object.entries(envelope.properties ?? {}).map(([name, property]) => ({
              key: name,
              cells: [
                <>
                  {name}
                  {envelope.required?.includes(name) ? null : <span className="ml-2 text-[var(--muted-foreground)]">optional</span>}
                </>,
                property.description,
              ],
            }))}
          />
          <div className="min-w-0">
            <CodePanel code={JSON.stringify(events[3], null, 2)} label="unit.status_changed · synthetic" />
          </div>
        </div>
      </SectionFrame>

      <SectionFrame id="catalogue" eyebrow="Event catalogue" title="Fifteen event types in five families." description="Required data is listed per type; every data object also accepts namespaced extensions. Each type has a downloadable example.">
        <SpecTable
          columns={["Type", "Family · authority", "Required data", "Meaning", "Example"]}
          label="HOS Events 0.1 catalogue"
          minWidth="56rem"
          rows={catalogue.map(([key, definition]) => ({
            key,
            cells: [
              definition.title,
              <>
                {definition["x-hos-family"]}
                <span className="block text-xs">{definition["x-hos-authority"]}</span>
              </>,
              <span className="font-mono text-xs" key="required">{definition.required?.join(", ")}</span>,
              definition.description,
              <a className="whitespace-nowrap text-[var(--accent-strong)] underline" download href={`${examplesPath}/${key}.json`} key="example">
                {key}.json
              </a>,
            ],
          }))}
        />
      </SectionFrame>

      <SectionFrame id="delivery" eyebrow="Delivery, ordering and replay" title="Six rules every producer and consumer apply the same way.">
        <ol className="grid gap-3">
          {deliveryRules.map(([title, text], index) => (
            <li className="grid gap-2 border border-[var(--border)] bg-[var(--card)] p-5 sm:grid-cols-[13rem_1fr]" key={title}>
              <p className="font-semibold">
                <span className="mr-2 font-mono text-xs text-[var(--accent-strong)]">0{index + 1}</span>
                {title}
              </p>
              <p className="text-sm leading-6 text-[var(--muted-foreground)]">{text}</p>
            </li>
          ))}
        </ol>
      </SectionFrame>

      <SectionFrame id="producers" eyebrow="Event Producer manifest" title="A system is not simply compatible: it declares exactly what it produces." description="A public system publishes its manifest at /.well-known/hos/manifest.json; a private one may use a configured, authenticated URL.">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["What it declares", "The events it emits for which properties, per dimension where relevant, whether it is the system of record for each, whether it may send snapshots, its delivery mechanisms and ordering, replay, retention and known limitations."],
            ["One authority", "At most one producer is authoritative for a given property, event type and dimension. A PMS can mirror housekeeping status without being its authority."],
            ["Signing in progress", "Organisation identity, published keys, JWS signature, expiry and rotation are being specified. The signature member is reserved in the schema."],
          ].map(([title, text]) => (
            <Card className="p-6" key={title}>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p>
            </Card>
          ))}
        </div>
        <p className="mt-6 text-sm">
          <a className="text-[var(--accent-strong)] underline" download href={`${scenarioPath()}/${scenario.files.producers[0]}`}>
            Example: the synthetic PMS manifest
          </a>
        </p>
      </SectionFrame>

      <SectionFrame id="reference" eyebrow="Reference situation · non-normative" title="What a consumer can derive: an arrival room-readiness risk." description="Situations are not part of the event catalogue. The reference projection emits them with the same envelope so they can be replayed and audited.">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <h3 className="font-mono text-sm">arrival.room_readiness_at_risk</h3>
            <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
              Raised when a stay is still expected and its assigned unit may not be ready when the guest comes: the guest is expected before the planned check-in and the unit is not ready, a maintenance window blocks the unit at that time, or another guest in house in the unit is not due to leave before then. A unit is not ready when its authoritative housekeeping status is not {scenario.projection.ready_housekeeping_statuses.join(" or ")} (in the scenarios), a window blocks it, or another guest still holds it. It carries the evidence, the conflicts, the latest task, and the window or the stay that holds the unit.
            </p>
          </Card>
          <Card className="p-6">
            <h3 className="font-mono text-sm">arrival.room_readiness_resolved</h3>
            <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
              Emitted when the risk stops holding, with the reason: the stay was given another unit, the unit is ready, the window went, the guest in house left or is now due to leave first, the arrival is no longer early, the reservation is inactive or the stay has started. Situations are emitted on transitions only, and HOS 0.1 never acts on them.
            </p>
          </Card>
        </div>
        <p className="mt-6 text-sm">
          <a className="text-[var(--accent-strong)] underline" download href={`${specVersionPath}/schemas/reference/arrival-readiness.schema.json`}>
            Reference situation schema (non-normative)
          </a>
        </p>
      </SectionFrame>

      <SectionFrame
        id="conformance"
        eyebrow="Conformance corpus"
        title={`Prove an implementation against ${numberWords[corpora.length] ?? corpora.length} scenarios and ${deliveries} synthetic deliveries.`}
        description="Each scenario is a property with its own producers and manifests. An implementation conforms when it reproduces every scenario's expected.json."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {corpora.map(({ id, scenario: corpus, events }) => (
            <Card className="flex flex-col p-6" key={id}>
              <p className="eyebrow">
                {events.length} deliveries · {corpus.property.timezone}
              </p>
              <h3 className="mt-3 font-semibold">
                <Link className="underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-[var(--accent)]" href={scenarioDemos[id].href}>
                  {corpus.title}
                </Link>
              </h3>
              <ul className="mt-4 flex-1 space-y-2 text-sm leading-6 text-[var(--muted-foreground)]">
                {corpus.covers.map((item) => (
                  <li className="border-t border-[var(--border)] pt-2" key={item}>
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-4 font-mono text-xs text-[var(--muted-foreground)]">{scenarioPath(id)}/</p>
            </Card>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/demo">
            <Button>Open the live demos and downloads</Button>
          </Link>
          <Link href="/participate/pilot">
            <Button variant="secondary">Validate it on your own systems</Button>
          </Link>
        </div>
      </SectionFrame>
    </>
  );
}
