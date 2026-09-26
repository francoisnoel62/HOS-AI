import type { Metadata } from "next";
import Link from "next/link";

import { LegalDocument, LegalSection, LegalText, legalLinkClass } from "@/components/legal/legal-document";
import { accessibility, documentDates, publisher } from "@/lib/legal";

export const metadata: Metadata = { title: "Accessibility", description: "HOS AI accessibility statement: target, status, how it is tested, known limitations and how to report a barrier." };

const contents = [
  { id: "commitment", title: "Commitment" },
  { id: "status", title: "Status" },
  { id: "testing", title: "How it is tested" },
  { id: "limitations", title: "Known limitations" },
  { id: "feedback", title: "Report a barrier" },
];

export default function AccessibilityPage() {
  return (
    <LegalDocument contents={contents} description="HOS AI aims to be usable by everyone who operates or builds hospitality systems. This statement says what that means today, how it is checked and how to tell us about a barrier." eyebrow="Accessibility" title="Accessibility statement" updated={documentDates.accessibility}>
      <LegalSection id="commitment" title="Commitment">
        <p>The website targets the Web Content Accessibility Guidelines (WCAG) 2.2, level AA. It is designed to work by keyboard, keep focus visible, meet contrast requirements in both themes, describe its diagrams in text, avoid colour-only status and honour reduced-motion preferences. Forms use visible labels, inline instructions and server-side validation.</p>
      </LegalSection>

      <LegalSection id="status" title="Status">
        <p>The website has not been audited against WCAG 2.2 or the French RGAA. It is therefore not declared conformant, even partially. This statement will be updated if an audit takes place.</p>
      </LegalSection>

      <LegalSection id="testing" title="How it is tested">
        <p>The project&apos;s browser test suite runs automated axe-core checks for WCAG 2.0, 2.1 and 2.2 level A and AA rules on the main pages, including the demos, participation forms and legal pages, in desktop and mobile browser profiles. Interface changes are reviewed at desktop and mobile widths, in both themes. Automated checks find only part of the barriers people meet.</p>
      </LegalSection>

      <LegalSection id="limitations" title="Known limitations">
        {accessibility.knownLimitations.length ? <ul className="list-disc space-y-1 pl-5">{accessibility.knownLimitations.map((limitation, index) => <li key={index}><LegalText value={limitation} /></li>)}</ul> : <p>No limitation is known at this date.</p>}
      </LegalSection>

      <LegalSection id="feedback" title="Report a barrier">
        <p>If a page, document, demo or diagram creates a barrier, tell us what you were trying to do and what went wrong. Write to <LegalText value={publisher.email} />, or use the <Link className={legalLinkClass} href="/contact">contact form</Link>. We reply within <LegalText value={accessibility.responseTime} /> and, where we can, provide the information in another form.</p>
      </LegalSection>
    </LegalDocument>
  );
}
