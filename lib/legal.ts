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
  name: pending("Publisher's legal name: your full name, or the name of the organisation"),
  legalForm: pending("Legal form, e.g. individual entrepreneur, association (loi 1901) or SAS"),
  registration: pending("Registration: SIREN and RCS city, or RNA number for an association; set to null if none") as LegalValue | null,
  shareCapital: pending("Share capital, for a company only; set to null otherwise") as LegalValue | null,
  vatNumber: pending("Intra-EU VAT number; set to null if none") as LegalValue | null,
  address: pending("Postal address of the registered office or of the publisher"),
  phone: pending("Telephone number"),
  email: pending("Contact email address, also used for privacy and accessibility requests"),
};

export const publicationDirector = pending("Full name of the publication director (for an organisation, its legal representative)");

export const host = {
  name: "Vercel Inc.",
  address: "440 N Barranca Avenue #4133, Covina, CA 91723, United States",
  phone: pending("Vercel's telephone number, as required for the host"),
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
    name: pending("Database provider"),
    purpose: "Stores form submissions, encrypted, and short-lived rate-limit keys.",
    location: pending("Database hosting region"),
    safeguard: pending("Transfer safeguard if the database is outside the EU, or \"No transfer outside the EU\""),
  },
  {
    name: pending("Email delivery provider"),
    purpose: "Sends the acknowledgement to you and a notification to the team.",
    location: pending("Email provider's processing location"),
    safeguard: pending("Transfer safeguard if outside the EU, or \"No transfer outside the EU\""),
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
  hostingLogs: pending("Vercel request log retention for your plan: 1 hour on Hobby, 1 day on Pro"),
};

export const terms = {
  governingLaw: pending("Governing law, e.g. French law"),
  courts: pending("Competent courts for disputes between professionals, e.g. the courts of your registered office's city"),
};

export const draftSpecificationLicence = pending(
  "Licence of the draft specification text until its CC BY 4.0 publication, e.g. \"CC BY 4.0 from now on\" or \"all rights reserved until 0.1 is final\"",
);

export const accessibility = {
  responseTime: pending("Response time you commit to for accessibility reports, e.g. 10 working days"),
  knownLimitations: [pending("Known barriers, one entry each; empty this list if none is known")] as LegalValue[],
};

export const security = {
  contact: publisher.email,
  responseTime: pending("Time within which you acknowledge a security report, e.g. 5 working days"),
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
    draftSpecificationLicence,
    accessibility.responseTime,
    ...accessibility.knownLimitations,
    security.responseTime,
  ];
  return [...new Set(values.filter((value): value is Pending => value !== null && isPending(value)).map((value) => value.pending))];
}
