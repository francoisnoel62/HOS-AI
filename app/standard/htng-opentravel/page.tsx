import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { CodePanel } from "@/components/content/code-panel";
import { PageHero } from "@/components/content/page-hero";
import { SectionFrame } from "@/components/content/section-frame";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { comparisonSources, contractAnswers, htngExpressQuotes, htngExpressRoom, layers, standardsCompared } from "@/lib/content/standards-comparison";
import { loadScenario } from "@/lib/spec";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "HOS, HTNG and OpenTravel",
  description: "OpenTravel and HTNG carry hotel messages. HOS makes operational facts trustworthy: who is the authority, when it happened, what stays out, and a public corpus to prove it.",
};

const htngExpressUrl = "https://github.com/HTNG/htng-express";

export default function StandardsComparisonPage() {
  // The occupancy declarations of the late check-out property, straight from its published manifests.
  const { manifests } = loadScenario("late-checkout");
  const occupancy = manifests.flatMap((manifest) =>
    manifest.events
      .filter((declaration) => declaration.type === "unit.status_changed" && declaration.dimensions?.includes("occupancy"))
      .map(({ type, dimensions, authoritative, note }) => [`"${manifest.producer}": {`, `  "type": "${type}",`, `  "dimensions": [${(dimensions ?? []).map((dimension) => `"${dimension}"`).join(", ")}],`, `  "authoritative": ${authoritative}${note ? "," : ""}`, ...(note ? [`  "note": ${JSON.stringify(note)}`] : []), "}"]),
  );
  const manifestExcerpt = `{\n${occupancy.map((lines) => lines.map((line) => `  ${line}`).join("\n")).join(",\n")}\n}`;

  return (
    <>
      <PageHero
        eyebrow="HOS, HTNG and OpenTravel"
        title="They carry the messages. HOS makes the facts trustworthy."
        description="OpenTravel and HTNG have spent more than twenty years getting hotel systems to talk: rates to channels, bookings to the PMS, check-ins to door locks. HOS builds on that work. It answers the question their messages leave to every project: when systems disagree about a room or a stay, what is true, who says so, and can a person or an AI agent act on it?"
        badge="HOS 0.1 · Draft · Positioning"
      />

      <SectionFrame eyebrow="Three standards, three questions" title="Each one answers a different question. Only one answers the last.">
        <div className="grid gap-4 lg:grid-cols-3">
          {standardsCompared.map((item) => {
            const hos = item.name === "HOS";
            return (
              <Card className={cn("flex flex-col p-6", hos && "border-[var(--accent)] bg-[var(--accent-soft)]")} key={item.name}>
                <p className="eyebrow">{item.since}</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{item.name}</h3>
                <p className={cn("mt-4 text-lg font-medium leading-7 tracking-[-0.02em]", hos && "text-[var(--accent-strong)]")}>“{item.question}”</p>
                <dl className="mt-6 space-y-4 text-sm leading-6">
                  <div className="border-t border-[var(--border)] pt-3">
                    <dt className="text-xs text-[var(--muted-foreground)]">Built for</dt>
                    <dd className="mt-1">{item.builtFor}</dd>
                  </div>
                  <div className="border-t border-[var(--border)] pt-3">
                    <dt className="text-xs text-[var(--muted-foreground)]">Shape</dt>
                    <dd className="mt-1">{item.shape}</dd>
                  </div>
                </dl>
              </Card>
            );
          })}
        </div>
      </SectionFrame>

      <SectionFrame
        eyebrow="The gap, in HTNG's own words"
        title="The industry has already named the problem."
        description="HTNG Express exists because operations systems wait too long for basic data from the PMS. Its README, in HTNG's official repository, puts it plainly:"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {htngExpressQuotes.map((quote) => (
            <figure className="border-l-2 border-[var(--accent)] bg-[var(--card)] p-6" key={quote}>
              <blockquote className="text-xl font-medium leading-8 tracking-[-0.02em]">“{quote}”</blockquote>
              <figcaption className="mt-4 text-sm text-[var(--muted-foreground)]">
                HTNG Express README,{" "}
                <a className="text-[var(--accent-strong)] underline" href={htngExpressUrl} rel="noreferrer" target="_blank">
                  github.com/HTNG/htng-express
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-8 max-w-3xl text-lg leading-8">
          HTNG Express makes that data quicker to fetch from one PMS. <strong>HOS makes it trustworthy across all of them:</strong> who is in the room and what state it is in, as facts with a source, a time and a declared authority, for every system on the property at once.
        </p>
      </SectionFrame>

      <SectionFrame
        eyebrow="One room, two answers"
        title="When the front office and housekeeping disagree, who wins?"
        description="HTNG Express's example room carries two occupancy statuses: one from the front office, one from housekeeping. Hotels run a discrepancy report for the rooms where they differ. Every system that reads both has to pick one, and each vendor picks for itself."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="min-w-0">
            <CodePanel code={JSON.stringify(htngExpressRoom, null, 2)} label="HTNG Express · example room, verbatim" />
            <p className="mt-3 text-sm text-[var(--muted-foreground)]">Two views of occupancy, side by side. Which one is right is left to the reader.</p>
          </div>
          <div className="min-w-0">
            <CodePanel code={manifestExcerpt} label="HOS 0.1 · the manifests decide" />
            <p className="mt-3 text-sm text-[var(--muted-foreground)]">One authority for occupancy at this property. The other view is still recorded, marked not authoritative.</p>
          </div>
        </div>
        <Card className="mt-6 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-sm leading-6">
            <strong>See it happen.</strong> In the late check-out scenario, a room attendant finds the room empty and reports it vacant. HOS records it and keeps the room held: an empty room is not a checked-out guest. The risk resolves only when the PMS, the declared authority, records the departure.
          </p>
          <Link className="shrink-0" href="/demo/late-checkout">
            <Button variant="secondary">
              Replay delivery 8 <ArrowRight aria-hidden="true" size={16} />
            </Button>
          </Link>
        </Card>
      </SectionFrame>

      <SectionFrame
        eyebrow="Built into the contract"
        title="Six answers every integration renegotiates. HOS writes them down once."
        description="A message says what its sender believes. HOS adds what a receiver needs to rely on it, in the same way for every producer. Each answer can be replayed in the live demo."
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {contractAnswers.map((answer, index) => (
            <Card className="flex flex-col p-6" key={answer.title}>
              <p className="font-mono text-xs text-[var(--accent)]">{String(index + 1).padStart(2, "0")}</p>
              <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em]">{answer.title}</h3>
              <p className="mt-3 flex-1 text-sm leading-6 text-[var(--muted-foreground)]">{answer.text}</p>
              <Link className="mt-5 inline-flex items-center gap-1 text-sm text-[var(--accent-strong)] underline-offset-4 hover:underline" href={answer.proof.href}>
                {answer.proof.label} <ArrowRight aria-hidden="true" size={14} />
              </Link>
            </Card>
          ))}
        </div>
        <p className="mt-8 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
          The contrast is by design, not a defect: a booking needs the guest’s profile and a payment guarantee, so OpenTravel’s reservation notification can carry both, and HTNG Express’s example reservation has fields for the guest’s name, phone and email, for the systems that contact the guest. An operational fact does not need any of it, so HOS leaves it where it is.
        </p>
      </SectionFrame>

      <SectionFrame eyebrow="Better together" title="Three layers. HOS adds the one that was missing." description="HOS does not replace distribution or device interfaces, and it never sends a booking or cuts a key. It sits beside them and turns what they do into facts everyone can trust.">
        <ol className="grid gap-3">
          {layers.map((layer, index) => (
            <li key={layer.verb}>
              <Card className={cn("grid gap-3 p-5 sm:grid-cols-[12rem_1fr_auto] sm:items-center", layer.standard === "HOS" && "border-[var(--accent)] bg-[var(--accent-soft)]")}>
                <p className="font-semibold">
                  <span className="mr-3 font-mono text-xs text-[var(--muted-foreground)]">{index + 1}</span>
                  {layer.verb}
                </p>
                <p className="text-sm leading-6 text-[var(--muted-foreground)]">{layer.text}</p>
                <p className="font-mono text-sm text-[var(--accent-strong)]">{layer.standard}</p>
              </Card>
            </li>
          ))}
        </ol>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ["Keep their identifiers", "A HOS reservation keeps the confirmation numbers other systems issued as typed external references: who issued them, what kind they are, and whether they were verified."],
            ["Publish from what you have", "A system that already receives an HTNG check-in notice or an OpenTravel reservation notification can publish the matching HOS fact, as HOS's experimental adapters already do from Mews, Apaleo and Cloudbeds payloads."],
            ["Rip nothing out", "Your channel manager, CRS and door locks keep their interfaces. HOS 0.1 observes; controlled action comes later, and only with a declared authority and human approval."],
          ].map(([title, text]) => (
            <Card className="p-6" key={title}>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p>
            </Card>
          ))}
        </div>
      </SectionFrame>

      <SectionFrame eyebrow="Where HOS is behind" title="Credit where it is due.">
        <Card className="grid gap-6 p-6 md:grid-cols-2">
          <p className="text-sm leading-6">
            OpenTravel and HTNG have more than two decades of adoption, published releases and production integrations behind them. <strong>HOS 0.1 is a draft.</strong> Its scenarios are synthetic, its three PMS mappings are unofficial, no implementation is certified, and manifest signing is still being specified.
          </p>
          <p className="text-sm leading-6">
            HOS covers the operations around a stay: reservations, stays, rooms, housekeeping, maintenance and guest signals. It has no rates, availability, folio or payment messages, and none is planned. That is OpenTravel’s and HTNG’s ground, and they hold it well. <strong>HOS earns its place only if it makes their messages more useful.</strong>
          </p>
        </Card>
      </SectionFrame>

      <SectionFrame eyebrow="Proof, not promises" title="Don't take our word for it. Replay it." description="Every claim this page makes about HOS is backed by a published file you can run through your own implementation.">
        <div className="flex flex-wrap gap-3">
          <Link href="/demo">
            <Button>
              Early arrival <ArrowRight aria-hidden="true" size={16} />
            </Button>
          </Link>
          <Link href="/demo/room-out-of-order">
            <Button variant="secondary">Room out of order</Button>
          </Link>
          <Link href="/demo/late-checkout">
            <Button variant="secondary">Late check-out</Button>
          </Link>
          <Link href="/participate/technical-contributor">
            <Button variant="ghost">Write the first OpenTravel or HTNG mapping</Button>
          </Link>
        </div>
      </SectionFrame>

      <SectionFrame eyebrow="Sources" title="What this page relies on." description="HOS AI is not affiliated with the OpenTravel Alliance, HTNG or the American Hotel & Lodging Association. Their names describe their public specifications; this page is our reading of them, checked on 25 September 2026.">
        <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {comparisonSources.map((source) => (
            <li className="grid gap-1 py-4 sm:grid-cols-[1fr_1.4fr] sm:gap-6" key={source.href}>
              <a className="inline-flex items-center gap-1 text-sm text-[var(--accent-strong)] underline" href={source.href} rel="noreferrer" target="_blank">
                {source.label} <ArrowUpRight aria-hidden="true" size={13} />
              </a>
              <p className="text-sm leading-6 text-[var(--muted-foreground)]">{source.note}</p>
            </li>
          ))}
        </ul>
      </SectionFrame>
    </>
  );
}
