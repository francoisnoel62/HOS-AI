export type Audience = {
  id: string;
  label: string;
  friction: string;
  value: string;
  example: string;
};

export const audiences: Audience[] = [
  {
    id: "operator",
    label: "Operator",
    friction: "A guest arrival decision is split across systems that disagree about the same unit.",
    value: "Retain operational control while making readiness decisions from traceable facts.",
    example: "See a room-readiness risk before an early arrival becomes an escalation.",
  },
  {
    id: "pms",
    label: "PMS",
    friction: "Every new integration repeats the same data-contract negotiation.",
    value: "Offer predictable mappings in a qualified, transparent operational ecosystem.",
    example: "Declare the reservation and stay events your product can authoritatively produce.",
  },
  {
    id: "software-vendor",
    label: "Software vendor",
    friction: "Useful operational logic is reimplemented for every source system.",
    value: "Build reusable hospitality logic and agent capabilities on a stable contract.",
    example: "Consume a declared unit-status event without inventing a private adapter contract.",
  },
  {
    id: "integrator",
    label: "Integrator",
    friction: "Mappings are expensive one-off projects with little replayable proof.",
    value: "Industrialise mappings, replay tests and conformance evidence.",
    example: "Deliver a JSON Lines replay that makes a mapping reviewable and repeatable.",
  },
  {
    id: "developer",
    label: "Developer",
    friction: "Schemas, source authority and permissions are rarely discoverable together.",
    value: "Work from versioned schemas, signed capability declarations and synthetic tests.",
    example: "Inspect the events a system exposes before you write an integration.",
  },
  {
    id: "patron",
    label: "Patron",
    friction: "The industry lacks neutral common infrastructure for the next operating model.",
    value: "Support a shared foundation without special rights over the standard or member data.",
    example: "Fund the commons while governance stays organisation-based and transparent.",
  },
];

export const participationPaths = [
  {
    slug: "founding-member",
    title: "Founding member",
    eyebrow: "Shape the common work",
    description:
      "Commit business and technical expertise, plus transparent financial support within future published bands.",
    cta: "Become a founding member",
  },
  {
    slug: "pilot",
    title: "Pilot partner",
    eyebrow: "Prove a real scenario",
    description:
      "Bring operational terrain, authorised access and the people able to validate the arrival-readiness mapping.",
    cta: "Run a pilot",
  },
  {
    slug: "technical-contributor",
    title: "Technical contributor",
    eyebrow: "Build in public",
    description:
      "Improve the Core, schemas, mappings, SDKs, tests or documentation through the open work.",
    cta: "Contribute technically",
  },
  {
    slug: "financial-patron",
    title: "Financial patron",
    eyebrow: "Support the commons",
    description:
      "Fund the shared work without gaining special voting, data or certification privileges.",
    cta: "Become a financial patron",
  },
] as const;

export type DocumentStatus = "Draft" | "In progress" | "Planned" | "Experimental" | "Partner-backed" | "Certified";

export const documentationItems: Array<{
  title: string;
  description: string;
  status: DocumentStatus;
  href?: string;
}> = [
  {
    title: "HOS Core 0.1",
    description: "Tenant, Property, Unit, Maintenance window, Reservation, Stay, Task, Guest and Message; opaque identifiers, external references and the four-dimension Unit status model.",
    status: "Draft",
    href: "/docs/core",
  },
  {
    title: "HOS Events 0.1",
    description: "Fifteen CloudEvents-compatible event types in five families, the envelope profile with time bases and actors, snapshots, and delivery, ordering and replay rules.",
    status: "Draft",
    href: "/docs/events",
  },
  {
    title: "Event Producer manifest",
    description: "A declaration of events, authority, snapshots, delivery, replay, retention and limitations. Draft schema published; signing is still in progress.",
    status: "In progress",
    href: "/docs/events#producers",
  },
  {
    title: "Arrival conformance scenario",
    description: "Thirteen synthetic deliveries covering the nominal case, a duplicate, an out-of-order event, conflicting facts, snapshot recovery and a missing capability.",
    status: "Draft",
    href: "/demo",
  },
  {
    title: "Mews mapping",
    description: "Mews Connector API webhooks and fetched reservations and resources, mapped to HOS Events 0.1 by an unofficial adapter. It replays the arrival scenario to the same expected outcome.",
    status: "Experimental",
    href: "/demo/mews",
  },
  {
    title: "Apaleo mapping",
    description: "Apaleo webhooks and fetched reservations and units, mapped to HOS Events 0.1 by an unofficial adapter. It replays the arrival scenario to the same expected outcome.",
    status: "Experimental",
    href: "/demo/apaleo",
  },
  {
    title: "Cloudbeds mapping",
    description: "Cloudbeds API v1.3 webhooks and fetched reservations and housekeeping status, mapped to HOS Events 0.1 by an unofficial adapter. It replays the arrival scenario to the same expected outcome; two webhook payloads are reconstructed.",
    status: "Experimental",
    href: "/demo/cloudbeds",
  },
  {
    title: "Partner-backed and certified mappings",
    description: "Partner-backed and certified are used only when the evidence exists. No mapping has reached either status.",
    status: "Planned",
  },
];
