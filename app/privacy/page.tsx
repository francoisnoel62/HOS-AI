import type { Metadata } from "next";

import { LegalDocument, LegalFacts, LegalSection, LegalTable, LegalText, legalLinkClass } from "@/components/legal/legal-document";
import { documentDates, processors, publisher, retention } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy", description: "What the HOS AI website collects, why, for how long, who processes it and how to exercise your rights." };

const contents = [
  { id: "controller", title: "Who is responsible" },
  { id: "processing", title: "What we process and why" },
  { id: "not-collected", title: "What we do not collect" },
  { id: "processors", title: "Providers and transfers" },
  { id: "security", title: "Security" },
  { id: "rights", title: "Your rights" },
  { id: "cookies", title: "Cookies and browser storage" },
  { id: "changes", title: "Changes to this notice" },
];

export default function PrivacyPage() {
  return (
    <LegalDocument contents={contents} description="The website collects personal data only through its participation and contact forms, and only what is needed to answer you. This notice explains what is collected, why, for how long and how to exercise your rights." eyebrow="Privacy" title="Privacy notice" updated={documentDates.privacy}>
      <LegalSection id="controller" title="Who is responsible">
        <p>The controller of the personal data described here is the publisher of this website:</p>
        <LegalFacts rows={[["Controller", publisher.name], ["Address", publisher.address], ["Privacy contact", publisher.email]]} />
        <p>No data protection officer has been appointed; the contact above handles every privacy request.</p>
      </LegalSection>

      <LegalSection id="processing" title="What we process and why">
        <LegalTable
          caption="Each processing activity, its data, purpose, legal basis and retention"
          head={["Activity", "Data", "Purpose and legal basis", "Kept for"]}
          rows={[
            [
              "Participation and contact forms",
              "Name, professional email, organisation, country, role, the answers specific to each form, your message and, if you give it, a GitHub handle or organisation website.",
              "To assess and answer your request. For participation paths, steps taken at your request before any agreement (GDPR Art. 6(1)(b)); for general inquiries, our legitimate interest in answering professional correspondence (Art. 6(1)(f)).",
              `${retention.submissionMonths} months after our last exchange, then deleted automatically, unless you ask for deletion sooner.`,
            ],
            [
              "Emails about your submission",
              "Your email address and the form you used.",
              "To confirm that we received your submission and to notify the team; same legal basis as the form.",
              "The provider's delivery logs, per its own retention.",
            ],
            [
              "Abuse prevention on forms",
              "A salted SHA-256 hash of your IP address and browser identifier; never the raw IP address. Cloudflare Turnstile receives your IP address and browser signals.",
              "To limit repeated submissions and block bots: our legitimate interest in keeping the forms secure (Art. 6(1)(f)).",
              "The hash: the rate-limit window, one hour by default, then deleted by a daily clean-up. Turnstile: per Cloudflare's policy.",
            ],
            [
              "Hosting logs",
              "IP address, browser identifier, requested address, date and time.",
              "To deliver and secure the website: our legitimate interest (Art. 6(1)(f)).",
              <LegalText key="logs" value={retention.hostingLogs} />,
            ],
          ]}
        />
        <p>Required form fields are marked. Without them we cannot assess the request. No decision about you is made by automated means.</p>
      </LegalSection>

      <LegalSection id="not-collected" title="What we do not collect">
        <p>The forms do not ask for guest data, credentials, API keys, operational exports or confidential commercial information; please do not include them. The website has no accounts, no payments, no newsletter, no advertising pixels, no retargeting and no audience-measurement tool. We do not sell or rent personal data.</p>
      </LegalSection>

      <LegalSection id="processors" title="Providers and transfers">
        <p>These providers process personal data on our behalf, under a data processing agreement. Some are in the United States; each transfer relies on the safeguard shown.</p>
        <LegalTable
          caption="Providers that process personal data"
          head={["Provider", "Role", "Location", "Transfer safeguard"]}
          rows={processors.map((processor) => [<LegalText key="name" value={processor.name} />, processor.purpose, <LegalText key="location" value={processor.location} />, <LegalText key="safeguard" value={processor.safeguard} />])}
        />
        <p>Cloudflare also uses Turnstile signals, as an independent controller, to improve its bot detection; see <a className={legalLinkClass} href="https://www.cloudflare.com/turnstile-privacy-policy/" rel="noreferrer" target="_blank">Cloudflare&apos;s Turnstile privacy addendum</a>. Within the team, only the people who review submissions can read them.</p>
      </LegalSection>

      <LegalSection id="security" title="Security">
        <p>Form contents and email addresses are encrypted with AES-256-GCM before they are stored. Operational metadata, such as the form type, country and dates, is stored separately. Traffic to the website uses HTTPS.</p>
      </LegalSection>

      <LegalSection id="rights" title="Your rights">
        <p>You can ask to access, correct or delete your data, to restrict its processing, to receive the data you gave us in a portable format, and object at any time to processing based on our legitimate interest. Write to <LegalText value={publisher.email} /> from the address you used in the form. We answer within one month and may ask you to confirm that the address is yours.</p>
        <p>You can also lodge a complaint with the data protection authority of the country where you live or work, or where you believe the infringement took place. In France, it is the <a className={legalLinkClass} href="https://www.cnil.fr/en/complaints" rel="noreferrer" target="_blank">CNIL</a>.</p>
      </LegalSection>

      <LegalSection id="cookies" title="Cookies and browser storage">
        <p>The website sets no advertising or audience-measurement cookie, so it does not ask for your consent. It stores only what it needs to work:</p>
        <LegalTable
          caption="What the website stores in your browser"
          head={["Name", "Stored by", "Purpose", "Duration"]}
          rows={[
            [<code key="theme">theme</code>, "This website, in local storage", "Remembers the light or dark theme you choose.", "Until you clear your browser storage."],
            ["Turnstile", "Cloudflare, on form pages", "Strictly necessary security check that the form is submitted by a person.", "Per Cloudflare's cookie policy."],
          ]}
        />
        <p>If an audience-measurement or other non-essential tool is ever added, this notice will be updated first and your consent requested where the law requires it.</p>
      </LegalSection>

      <LegalSection id="changes" title="Changes to this notice">
        <p>Each version is dated at the top of this page. Every form submission records the version in force when it was sent.</p>
      </LegalSection>
    </LegalDocument>
  );
}
