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
    label: "Hotel or group",
    friction: "Knowing whether a guest can check in means checking several screens that do not agree.",
    value:
      "Your team sees one picture of each arrival and knows which system to trust. You can change a tool without rebuilding everything around it.",
    example: "Know at 9:00 that the room for an early arrival will not be ready, not when the guest is at the desk.",
  },
  {
    id: "pms",
    label: "PMS vendor",
    friction: "Every new partner integration means negotiating the same data again, field by field.",
    value: "Describe your data once, in an open format, and let hotel software partners connect more predictably.",
    example: "Publish which booking and stay updates your PMS provides, and which ones it is the official source for.",
  },
  {
    id: "software-vendor",
    label: "Software vendor",
    friction: "The same logic has to be rebuilt for every PMS you connect to.",
    value: "Build your features once on a stable, open standard and reuse them wherever it is supported.",
    example: "A housekeeping app reads room status the same way, whichever PMS the hotel runs, once that PMS is mapped to HOS.",
  },
  {
    id: "integrator",
    label: "Integrator",
    friction: "Each integration is a one-off project that is hard to test again later.",
    value: "Reuse mappings and prove they work with shared test cases.",
    example: "Hand your client a test they can replay to check the integration still does what it should.",
  },
  {
    id: "developer",
    label: "Developer",
    friction: "Data formats, sources and permissions are rarely documented in one place.",
    value: "Open data formats, systems that state what they provide, and ready-made test data.",
    example: "See exactly what a system sends before you write a line of integration code.",
  },
  {
    id: "patron",
    label: "Patron",
    friction: "Hospitality has no neutral, shared infrastructure for what comes next.",
    value: "Fund common ground for the whole industry, with no special say over the standard or anyone's data.",
    example: "Support the shared work while its governance works toward one organisation, one vote.",
  },
];

export const participationPaths = [
  {
    slug: "pilot",
    title: "Pilot partner",
    eyebrow: "For hotels and PMS vendors",
    description: "Bring a hotel or a platform, authorised access to its systems, and the people who can tell whether HOS gets arrivals right.",
    cta: "Run a pilot",
  },
  {
    slug: "founding-member",
    title: "Founding member",
    eyebrow: "For organisations shaping HOS",
    description: "Bring business and technical expertise, and financial support at levels that will be published openly.",
    cta: "Become a founding member",
  },
  {
    slug: "technical-contributor",
    title: "Technical contributor",
    eyebrow: "For developers and integrators",
    description: "Help build the standard in the open: data formats, PMS mappings, tests or documentation.",
    cta: "Contribute technically",
  },
  {
    slug: "financial-patron",
    title: "Financial patron",
    eyebrow: "For funders",
    description: "Fund the shared work. Patrons get no special vote, data access or certification advantage.",
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
    description:
      "Tenant, Property, Unit, Maintenance window, Reservation, Stay, Task, Guest and Message; opaque identifiers, external references and the four-dimension Unit status model.",
    status: "Draft",
    href: "/docs/core",
  },
  {
    title: "HOS Events 0.1",
    description:
      "Fifteen CloudEvents-compatible event types in five families, the envelope profile with time bases and actors, snapshots, and delivery, ordering and replay rules.",
    status: "Draft",
    href: "/docs/events",
  },
  {
    title: "Event Producer manifest",
    description:
      "A declaration of events, authority, snapshots, delivery, replay, retention and limitations, signed by its producer with a published key. Draft schema, signing rules and test vectors published.",
    status: "Draft",
    href: "/docs/events#producers",
  },
  {
    title: "Arrival conformance scenarios",
    description:
      "Three synthetic scenarios, 42 deliveries: an early arrival to a room not yet released, an assigned room out of order, and a late check-out on a same-day turnover. They cover duplicates, out-of-order and late deliveries, conflicting and mirrored facts, snapshot recovery and a missing capability.",
    status: "Draft",
    href: "/demo",
  },
  {
    title: "The hos command and the SDK",
    description:
      "@hos-ai/cli and @hos-ai/sdk on npm, both alphas: validation, replay, the conformance scenarios for an implementation in any language, the producer check and signed manifests. Their documentation starts with install, a quickstart and how to read a report.",
    status: "Draft",
    href: "/docs/tools",
  },
  {
    title: "HOS, HTNG and OpenTravel",
    description:
      "What OpenTravel, HTNG and HOS each answer, the six answers HOS writes into the contract, how the three fit together, and where HOS is still behind. Sourced from the public specifications.",
    status: "Draft",
    href: "/standard/htng-opentravel",
  },
  {
    title: "Mews mapping",
    description:
      "Mews Connector API webhooks and fetched reservations and resources, mapped to HOS Events 0.1 by an unofficial adapter. It replays the arrival scenario to the same expected outcome, and has run read-only against Mews's two public demo enterprises: 3,485 facts, every one valid.",
    status: "Experimental",
    href: "/demo/mews",
  },
  {
    title: "Apaleo mapping",
    description:
      "Apaleo webhooks and fetched reservations and units, mapped to HOS Events 0.1 by an unofficial adapter. It replays the arrival scenario to the same expected outcome, and has run read-only against the five sample hotels of an Apaleo developer account: 740 facts, every one valid.",
    status: "Experimental",
    href: "/demo/apaleo",
  },
  {
    title: "Cloudbeds mapping",
    description:
      "Cloudbeds API v1.3 webhooks and fetched reservations and housekeeping status, mapped to HOS Events 0.1 by an unofficial adapter. It replays the arrival scenario to the same expected outcome; two webhook payloads are reconstructed. Its live check is ready but has not run on a real property yet.",
    status: "Experimental",
    href: "/demo/cloudbeds",
  },
  {
    title: "Partner-backed and certified mappings",
    description: "Partner-backed and certified are used only when the evidence exists. No mapping has reached either status.",
    status: "Planned",
  },
];
