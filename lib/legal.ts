// The single source of the facts used by the legal notice, privacy notice, terms, accessibility statement,
// footer, form notices and acknowledgement email. Change a fact here and every page follows.
//
// A `pending(...)` value is a fact only the publisher can supply. It renders as a visible
// "[To complete: …]" marker, and `npm run legal:check` lists every one still open.
// Set an optional field to `null` when it does not apply (e.g. share capital for an individual).

export type Pending = { readonly pending: string };
export type LegalValue = string | Pending;

export function pending(label: string): Pending {
  return { pending: label };
}

export function isPending(value: LegalValue): value is Pending {
  return typeof value !== "string";
}

/** A legal value as plain text, for emails and machine-readable files. */
export function legalText(value: LegalValue) {
  return isPending(value) ? `[To complete: ${value.pending}]` : value;
}

/** Stored with every form submission, so each record shows which privacy notice it was collected under. */
export const privacyVersion = "2026-09-26";

export const documentDates = {
  legal: "2026-09-26",
  privacy: privacyVersion,
  terms: "2026-09-26",
  accessibility: "2026-09-26",
} as const;

export const publisher = {
  name: "François Noel" as LegalValue,
  legalForm: "Individual, publishing in a personal capacity" as LegalValue,
  registration: null as LegalValue | null,
  shareCapital: null as LegalValue | null,
  vatNumber: null as LegalValue | null,
  address: "Lille, France" as LegalValue,
  phone: "+33 7 49 15 42 69" as LegalValue,
  email: "francoisnoel62@gmail.com" as LegalValue,
};

export const publicationDirector: LegalValue = "François Noel";

export const host = {
  name: "Vercel Inc.",
  address: "440 N Barranca Avenue #4133, Covina, CA 91723, United States",
  phone: "+1 (559) 288-7060" as LegalValue,
  website: "https://vercel.com",
};

export type Processor = { name: LegalValue; purpose: string; location: LegalValue; safeguard: LegalValue };

export const processors: Processor[] = [
  {
    name: "Vercel Inc.",
    purpose: "Hosts the website, runs the form handler and keeps request logs.",
    location: "United States, with edge locations worldwide",
    safeguard: "EU-U.S. Data Privacy Framework certification",
  },
  {
    name: "Neon (Databricks, Inc.)",
    purpose: "Stores form submissions, encrypted, and short-lived rate-limit keys.",
    location: "European Union (Frankfurt, Germany)",
    safeguard:
      "Data stored in the EU; any access from the United States is covered by the EU-U.S. Data Privacy Framework and standard contractual clauses",
  },
  {
    name: "Resend, Inc.",
    purpose: "Sends the acknowledgement to you and a notification to the team.",
    location: "United States",
    safeguard: "EU-U.S. Data Privacy Framework certification and standard contractual clauses",
  },
  {
    name: "Cloudflare, Inc. (Turnstile)",
    purpose: "Checks that a form is submitted by a person rather than a bot.",
    location: "United States",
    safeguard: "EU-U.S. Data Privacy Framework certification",
  },
];

export const retention = {
  submissionMonths: 12,
  hostingLogs: "One hour, on the host's current plan." as LegalValue,
};

export const terms = {
  governingLaw: "French law" as LegalValue,
  courts: "the competent French courts" as LegalValue,
};

export const accessibility = {
  responseTime: "10 working days" as LegalValue,
  knownLimitations: [] as LegalValue[],
};

export const security = {
  contact: publisher.email,
  responseTime: "5 working days" as LegalValue,
};

/** Every placeholder still open, deduplicated, for the page banner and `npm run legal:check`. */
export function pendingLegalFields(): string[] {
  const values: Array<LegalValue | null> = [
    ...Object.values(publisher),
    publicationDirector,
    ...Object.values(host),
    ...processors.flatMap((processor) => [processor.name, processor.location, processor.safeguard]),
    retention.hostingLogs,
    ...Object.values(terms),
    accessibility.responseTime,
    ...accessibility.knownLimitations,
    security.responseTime,
  ];
  return [...new Set(values.filter((value): value is Pending => value !== null && isPending(value)).map((value) => value.pending))];
}
