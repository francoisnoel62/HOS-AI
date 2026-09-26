import type { Metadata } from "next";
import Link from "next/link";

import { LegalDocument, LegalFacts, LegalSection, LegalTable, LegalText, legalLinkClass } from "@/components/legal/legal-document";
import { documentDates, draftSpecificationLicence, host, publicationDirector, publisher } from "@/lib/legal";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = { title: "Legal notice", description: "Who publishes and hosts the HOS AI website, and the licences and marks that apply to its content." };

const contents = [
  { id: "publisher", title: "Publisher" },
  { id: "hosting", title: "Hosting" },
  { id: "licensing", title: "Licensing" },
  { id: "marks", title: "HOS AI name and marks" },
  { id: "third-party", title: "Third-party names" },
  { id: "content-status", title: "Status of the content" },
  { id: "links", title: "External links" },
  { id: "credits", title: "Credits" },
  { id: "reporting", title: "Reporting content" },
];

export default function LegalPage() {
  return (
    <LegalDocument contents={contents} description="Who publishes and hosts this website, and what you may reuse from it. The privacy notice, terms of use and accessibility statement are separate pages." eyebrow="Legal notice" title="Legal notice" updated={documentDates.legal}>
      <LegalSection id="publisher" title="Publisher">
        <p>This website, {siteConfig.url.replace(/^https?:\/\//, "")}, is published by:</p>
        <LegalFacts
          rows={[
            ["Name", publisher.name],
            ["Legal form", publisher.legalForm],
            ["Registration", publisher.registration],
            ["Share capital", publisher.shareCapital],
            ["VAT number", publisher.vatNumber],
            ["Address", publisher.address],
            ["Telephone", publisher.phone],
            ["Email", publisher.email],
            ["Publication director", publicationDirector],
          ]}
        />
        <p>HOS AI is the name of an early-stage initiative, not a legal entity. An independent HOS Foundation is an objective; none has been established.</p>
      </LegalSection>

      <LegalSection id="hosting" title="Hosting">
        <LegalFacts rows={[["Host", host.name], ["Address", host.address], ["Telephone", host.phone], ["Website", <a className={legalLinkClass} href={host.website} key="host" rel="noreferrer" target="_blank">{host.website.replace("https://", "")}</a>]]} />
        <p>The other providers that process personal data are listed in the <Link className={legalLinkClass} href="/privacy#processors">privacy notice</Link>.</p>
      </LegalSection>

      <LegalSection id="licensing" title="Licensing">
        <p>Different parts of this website are licensed differently. Reuse follows the licence of the material you take.</p>
        <LegalTable
          caption="Licence of each kind of material"
          head={["Material", "Licence"]}
          rows={[
            ["Website source code, in the public repository", <><a className={legalLinkClass} href="https://www.apache.org/licenses/LICENSE-2.0" rel="noreferrer" target="_blank">Apache License 2.0</a></>],
            [<>HOS 0.1 schemas, examples, conformance scenarios and mapping recordings, under <code>/spec/0.1</code></>, "Apache License 2.0"],
            [<>HOS specification text, at <Link className={legalLinkClass} href="/docs/core">/docs/core</Link> and <Link className={legalLinkClass} href="/docs/events">/docs/events</Link></>, <>Intended for <a className={legalLinkClass} href="https://creativecommons.org/licenses/by/4.0/" rel="noreferrer" target="_blank">CC BY 4.0</a> when 0.1 is published. Until then: <LegalText value={draftSpecificationLicence} /></>],
            ["Other website text, diagrams and illustrations", "All rights reserved. Short quotations with attribution are welcome."],
            ["HOS AI name, mark, logo, favicon and social images", <>Not licensed. See <a className={legalLinkClass} href="#marks">HOS AI name and marks</a>.</>],
          ]}
        />
        <p>Contributions to the repository are accepted under the Apache License 2.0, section 5. Any future contributor licence agreement will be published and reviewed separately; it is never accepted implicitly through a form.</p>
      </LegalSection>

      <LegalSection id="marks" title="HOS AI name and marks">
        <p>The HOS AI name, its temporary mark and its logo identify this initiative. Neither the code licence nor the specification licence grants a right to use them. You may use the name to refer accurately to HOS AI or to the HOS specification. Do not use it, or the mark, in a way that suggests endorsement, certification or partnership.</p>
      </LegalSection>

      <LegalSection id="third-party" title="Third-party names">
        <p>Mews, Apaleo, Cloudbeds, HTNG, OpenTravel, the American Hotel &amp; Lodging Association and the other product and organisation names on this website belong to their owners. They are used only to identify the systems and specifications described.</p>
        <p>HOS AI is not affiliated with, sponsored or endorsed by any of them. The PMS mappings are unofficial and were written from published documentation, packages and SDKs. The HTNG and OpenTravel comparison is our reading of their public specifications.</p>
      </LegalSection>

      <LegalSection id="content-status" title="Status of the content">
        <p>HOS Core 0.1 and HOS Events 0.1 are drafts for review. Names, fields and rules may change. Examples, conformance scenarios and PMS payloads are synthetic. Live-check figures describe runs against demonstration data on the dates given.</p>
        <p>No implementation, mapping or integration is certified or partner-backed. Nothing on this website is operational, legal or investment advice. The <Link className={legalLinkClass} href="/terms">terms of use</Link> set out the limits of our responsibility.</p>
      </LegalSection>

      <LegalSection id="links" title="External links">
        <p>Links to other websites, such as GitHub, PMS documentation or published standards, are given for reference. We do not control those websites and are not responsible for their content or availability.</p>
      </LegalSection>

      <LegalSection id="credits" title="Credits">
        <p>Typefaces: Geist and Geist Mono by Vercel, under the SIL Open Font License 1.1, served from this website. Icons: Lucide, under the ISC licence. The open-source packages used to build the website are listed in its <a className={legalLinkClass} href={`${siteConfig.githubUrl}/blob/master/package.json`} rel="noreferrer" target="_blank">package manifest</a>, each under its own licence.</p>
      </LegalSection>

      <LegalSection id="reporting" title="Reporting content">
        <p>To report content that you believe is unlawful or infringes your rights, write to <LegalText value={publisher.email} /> with the page address and the reason for your report. Security vulnerabilities follow the <a className={legalLinkClass} href={`${siteConfig.githubUrl}/blob/master/SECURITY.md`} rel="noreferrer" target="_blank">security policy</a>.</p>
      </LegalSection>
    </LegalDocument>
  );
}
