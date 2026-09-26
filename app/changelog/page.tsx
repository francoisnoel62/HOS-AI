import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/content/page-hero";
import { StatusBadge } from "@/components/content/status-badge";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Changelog", description: "Published changes and decisions only." };

const entries = [
  {
    date: "26 September 2026",
    title: "The Apaleo mapping runs against a live account, and a Cloudbeds check is ready.",
    items: [
      "Read-only live checks now exist for Apaleo and Cloudbeds, as for Mews. Each fetches what an integration fetches before its first webhook, runs it through the adapter and reports facts by type, schema errors, what a second pass would publish, and today's arrivals as the reference projection sees them. Reports keep no PMS payloads, guest data or credentials.",
      "Apaleo, against the five sample hotels of a developer account: 740 facts, every one valid HOS 0.1, and none published twice.",
      "Three arrivals added to the Paris sample hotel read as set up: a clean room ready, a dirty room not ready, and a room under maintenance blocked, with a room-readiness risk raised.",
      "A live account showed what the documentation did not: Apaleo refuses an OutOfOrder maintenance on a room already assigned to a reservation. The Cloudbeds check has not run on a real property yet.",
    ],
    links: [
      ["/demo/apaleo", "Apaleo mapping"],
      ["/demo/cloudbeds", "Cloudbeds mapping"],
    ],
  },
  {
    date: "25 September 2026",
    title: "The Mews mapping runs against Mews's live demo.",
    items: [
      "A read-only live check runs the Mews adapter against a live Connector API environment. It calls only configuration and getAll operations.",
      "Against Mews's two public demo enterprises: 689 reservations and 2,584 resources gave 3,485 facts, every one valid HOS 0.1, and none published twice. Every Mews field the adapter reads was present, and every state it met is documented.",
      "The first runs changed the integration. Dorm stays are assigned to beds, so beds are now units. Accommodation is picked by resource category, because parking and meeting rooms are also sold by the day. And the shared demo tokens are rate-limited, so the check retries.",
    ],
    links: [["/demo/mews", "Mews mapping"]],
  },
  {
    date: "25 September 2026",
    title: "HOS, HTNG and OpenTravel: where HOS fits.",
    items: [
      "A new page sets HOS beside OpenTravel and HTNG: the question each one answers, the six answers HOS writes into the contract, how the three layers fit together, and where HOS is still behind.",
      "Every statement about OpenTravel and HTNG is sourced from their public specifications and repositories, listed on the page.",
    ],
    links: [["/standard/htng-opentravel", "Read HOS, HTNG and OpenTravel"]],
  },
  {
    date: "25 September 2026",
    title: "Two more arrival scenarios: a room out of order and a late check-out.",
    items: [
      "Room out of order: a leak takes the assigned room out of order on the arrival morning. A maintenance system plans the repair, the PMS copies it without being the authority, an older revision syncs late, and the front desk moves the guest. Fourteen deliveries at a property in Lisbon.",
      "Late check-out: a late check-out is granted in a room already assigned to a same-day arrival. A room attendant's glance is not a check-out, a stale plan is replayed, and the check-out reaches HOS after the dirty status. Fifteen deliveries at a property in Toronto.",
      "The reference projection now treats a unit another guest still holds as not ready, and raises the risk when that guest is not due to leave before the arrival. A resolved risk says why: unit_reassigned, unit_vacated and departure_before_arrival join the reasons. The early-arrival scenario and its expected outcome are unchanged.",
    ],
    links: [
      ["/demo/room-out-of-order", "Replay the room out of order"],
      ["/demo/late-checkout", "Replay the late check-out"],
    ],
  },
  {
    date: "25 September 2026",
    title: "HOS 0.1 draft: scheduled maintenance windows.",
    items: [
      "Core gains a ninth entity, the maintenance window: a planned period when a unit is out of service or cannot be sold, the statuses it imposes, and an optional reason.",
      "Two unit events: unit.maintenance_scheduled, published again whenever the plan changes, and unit.maintenance_cancelled. The catalogue grows to fifteen types. A plan never changes a unit's current statuses; unit.status_changed does.",
      "The reference projection raises a room-readiness risk when a window blocks the assigned unit at the time the guest is expected, even without an early arrival. When the window goes, it resolves the risk as unit_available.",
      "The Mews, Apaleo and Cloudbeds adapters map resource blocks, maintenances and room blocks. Cloudbeds block dates are read as nights, pending confirmation on a live property.",
    ],
    links: [
      ["/docs/core", "Read HOS Core 0.1"],
      ["/docs/events", "Read HOS Events 0.1"],
    ],
  },
  {
    date: "25 September 2026",
    title: "HOS 0.1 draft: what the PMS mappings showed was missing.",
    items: [
      "Two stay events: stay.unit_unassigned releases a unit from a stay, and stay.check_in_reverted makes a stay expected again. The catalogue grows to thirteen types, and the reference projection handles both.",
      "Envelope: hostimebasis gains modified, for sources that only date an entity's last modification, and hosactor names who made a change, as a pseudonymous, producer-scoped reference.",
      "Core: a Property declares standard check-in and check-out times for sources that plan stays in days. A reservation for several units yields one Stay per unit, and a producer without a stable guest identity publishes no guest_id.",
      "stay.expected is due as soon as a stay is committed, and again when its planned times change; its business date is the arrival's. The Mews, Apaleo and Cloudbeds adapters use every addition; the conformance corpus and its expected outcome are unchanged.",
    ],
    links: [
      ["/docs/events", "Read HOS Events 0.1"],
      ["/docs/core", "Read HOS Core 0.1"],
    ],
  },
  {
    date: "25 September 2026",
    title: "Experimental Mews, Apaleo and Cloudbeds mappings replay the arrival scenario.",
    items: [
      "Unofficial reference adapters map Mews Connector API, Apaleo API and Cloudbeds API v1.3 webhooks, and the entities an integration fetches for them, to HOS Events 0.1. They were written from each PMS's published documentation, packages or SDK, and are not endorsed by any of them.",
      "The PMS deliveries of the arrival scenario are recorded in each PMS's format. Replayed through each adapter, they reach the scenario's expected outcome. Delivery 7, a PMS task, has no counterpart in any of the three; Apaleo and Cloudbeds add the room's occupancy.",
      "The mappings exposed gaps in HOS 0.1: no event to remove a unit assignment or revert a check-in, no defined moment for stay.expected, no place for the actor of a change, and no way to say that a time is only a last modification. The draft now covers them.",
    ],
    links: [
      ["/demo#pms-mappings", "Compare the three mappings"],
      ["/demo/mews", "Mews"],
      ["/demo/apaleo", "Apaleo"],
      ["/demo/cloudbeds", "Cloudbeds"],
    ],
  },
  {
    date: "24 September 2026",
    title: "HOS Core 0.1 realigned and HOS Events 0.1 draft published.",
    items: [
      "Core 0.1 now has eight entities, including Tenant, typed external references, namespaced extensions, sensitivity classes and the four-dimension Unit status model (occupancy, housekeeping, maintenance, commercial), each with unknown.",
      "HOS Events 0.1: the envelope profile, eleven event types in five families, explicit snapshots, and delivery, ordering and replay rules.",
      "Breaking for the earlier draft: hos-event.schema.json is replaced by core, event-envelope and events schemas; hospropertyid becomes hosproperty, hostimezone becomes hospropertytimezone, and hostenant and hossubjects are required. task.completed becomes housekeeping.task.completed and stay.arrival_signaled becomes a signal in guest.message.received.",
      "Arrival readiness situations are now a non-normative reference. The conformance scenario grows to thirteen deliveries, adding snapshot recovery and a missing capability, and every event type has an example.",
    ],
    links: [
      ["/docs/events", "Read HOS Events 0.1"],
      ["/docs/core", "Read HOS Core 0.1"],
    ],
  },
  {
    date: "24 September 2026",
    title: "HOS Core 0.1 draft and the arrival-readiness scenario.",
    items: [
      "Readable draft of HOS Core 0.1: entities, event envelope, processing rules and the arrival-readiness projection.",
      "JSON Schemas for HOS 0.1 events and Event Producer manifests.",
      "A synthetic conformance scenario of nine deliveries with its expected outcome, and a live replay.",
    ],
    links: [["/demo", "Open the live demo"]],
  },
];

export default function ChangelogPage() {
  return (
    <>
      <PageHero eyebrow="Changelog" title="Nothing is announced before it exists." description="This changelog lists released artefacts and published decisions, newest first. HOS AI does not promise a content rhythm before the project has one." />
      <section className="mx-auto max-w-6xl space-y-4 px-5 pb-20 lg:px-8">
        {entries.map((entry) => (
          <Card className="p-8" key={entry.title}>
            <div className="flex flex-wrap items-center gap-3">
              <p className="eyebrow">{entry.date}</p>
              <StatusBadge status="Draft" />
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.045em]">{entry.title}</h2>
            <ul className="mt-4 max-w-3xl space-y-2 text-sm leading-6 text-[var(--muted-foreground)]">
              {entry.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap gap-4 text-sm">
              {entry.links.map(([href, label]) => (
                <Link className="text-[var(--accent-strong)] underline" href={href} key={href}>
                  {label}
                </Link>
              ))}
            </div>
          </Card>
        ))}
      </section>
    </>
  );
}
