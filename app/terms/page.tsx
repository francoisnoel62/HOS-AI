import type { Metadata } from "next";
import Link from "next/link";

import { LegalDocument, LegalSection, LegalText, legalLinkClass } from "@/components/legal/legal-document";
import { documentDates, publisher, terms } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of use", description: "The conditions for using the HOS AI website, its draft specification, demos and forms." };

const contents = [
  { id: "scope", title: "Scope" },
  { id: "access", title: "Access" },
  { id: "content", title: "Draft content and demos" },
  { id: "reuse", title: "Reusing the material" },
  { id: "forms", title: "Forms and participation" },
  { id: "feedback", title: "Ideas and feedback" },
  { id: "conduct", title: "Acceptable use" },
  { id: "liability", title: "Liability" },
  { id: "changes", title: "Changes" },
  { id: "law", title: "Governing law" },
];

export default function TermsPage() {
  return (
    <LegalDocument contents={contents} description="The conditions for using this website, its draft specification, demos and forms. They are short because the website sells nothing and has no accounts." eyebrow="Terms of use" title="Terms of use" updated={documentDates.terms}>
      <LegalSection id="scope" title="Scope">
        <p>These terms apply to anyone who uses this website. “We” means its publisher, identified in the <Link className={legalLinkClass} href="/legal">legal notice</Link>. By using the website, you accept these terms. The <Link className={legalLinkClass} href="/privacy">privacy notice</Link> explains how personal data is handled.</p>
      </LegalSection>

      <LegalSection id="access" title="Access">
        <p>The website is free to use and requires no account. We may change, suspend or withdraw any part of it, including the demos and downloadable files, without notice. We do not guarantee that it is always available or free of errors.</p>
      </LegalSection>

      <LegalSection id="content" title="Draft content and demos">
        <p>HOS Core 0.1 and HOS Events 0.1 are drafts for review, not a published standard. Names, fields and rules may change. The demos replay synthetic data through a non-normative reference projection. The PMS mappings are experimental and unofficial, and live-check figures describe runs against demonstration data on the dates given.</p>
        <p>No implementation, mapping or integration is certified or partner-backed. Before relying on any of this material in an operational system, assess it yourself.</p>
      </LegalSection>

      <LegalSection id="reuse" title="Reusing the material">
        <p>You may reuse the code, schemas and specification under the licences set out in the <Link className={legalLinkClass} href="/legal#licensing">legal notice</Link>. Those licences, not these terms, govern reuse, including their own warranty disclaimers. The HOS AI name, mark and logo are not licensed.</p>
      </LegalSection>

      <LegalSection id="forms" title="Forms and participation">
        <p>The participation and contact forms are for professional contact only. Give accurate information, and do not send guest data, credentials, API keys, operational exports or confidential commercial information.</p>
        <p>Submitting a form expresses interest. It does not create membership, a pilot agreement, a contribution agreement, a financial commitment, voting rights or any exclusive right, and it does not oblige us to follow up. Any participation, pilot, contribution or financial support will be set out in a separate written agreement.</p>
      </LegalSection>

      <LegalSection id="feedback" title="Ideas and feedback">
        <p>Comments, counter-proposals and ideas sent through the forms are not treated as confidential. You allow us to use them, free of charge, to develop the HOS specification and this website, without owing you attribution or payment. Do not send anything you are not free to share. Contributions to the repository follow its licence instead.</p>
      </LegalSection>

      <LegalSection id="conduct" title="Acceptable use">
        <p>Do not use the website in a way that breaks the law, disrupts it, overloads it, or bypasses its rate limits or bot protection. Do not submit forms on someone else&apos;s behalf without their permission, or send unsolicited promotion through them.</p>
      </LegalSection>

      <LegalSection id="liability" title="Liability">
        <p>The website and its material are provided as they are. To the extent the law allows, we are not liable for indirect loss, loss of business or data, or for any decision made on the basis of the draft specification, the demos or the mappings. Nothing in these terms limits liability that cannot be limited by law, including towards consumers.</p>
      </LegalSection>

      <LegalSection id="changes" title="Changes">
        <p>We may update these terms. The date at the top of this page shows the version in force; changes apply from the time they are published.</p>
      </LegalSection>

      <LegalSection id="law" title="Governing law">
        <p>These terms are governed by <LegalText value={terms.governingLaw} />. Disputes between professionals are submitted to <LegalText value={terms.courts} />. A consumer keeps the protection of the mandatory rules of their country of residence. Questions about these terms: <LegalText value={publisher.email} />.</p>
      </LegalSection>
    </LegalDocument>
  );
}
