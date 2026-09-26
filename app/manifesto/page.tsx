import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/content/page-hero";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Manifesto", description: "The HOS AI public statement of purpose." };

export default function ManifestoPage() {
  return (
    <>
      <PageHero
        eyebrow="Manifesto"
        title="Hospitality should own an open path into the agentic era."
        description="HOS AI is an early-stage initiative working toward an independent HOS Foundation. Its aim: that the hospitality industry as a whole, not any single company, sets the rules for how its systems work together and how AI enters its operations."
      />
      <article className="mx-auto max-w-3xl px-5 pb-20 text-lg leading-8 text-[var(--muted-foreground)] lg:px-8">
        <div className="space-y-7 border-t border-[var(--border)] pt-10">
          <p>
            A hotel runs on many systems: the PMS, housekeeping, guest messaging, and a few more every year. Each one knows part of what is happening.
            None of them knows all of it, and they rarely speak the same language. So the team fills the gaps by hand, with phone calls, radio
            messages and a second look at every screen.
          </p>
          <p>
            AI is now arriving in hotel operations. An AI tool can only help if it understands the same facts as the team, and it can only be trusted
            if everyone knows what it is allowed to do. Without a shared language, every hotel and every software vendor will have to solve this
            alone, again and again.
          </p>
          <p>
            HOS exists to make that shared language open. It gives every system the same way to describe a booking, a room, a cleaning task or a
            guest&apos;s arrival, and it says where each piece of information comes from and which system is the official source.
          </p>
          <p>
            HOS does not ask anyone to hand over control. There is no central database, no mandatory cloud and no AI acting behind the team&apos;s
            back. Each system stays in charge of its own information, and guest data is kept to what is strictly needed. When HOS allows actions, they
            will happen only within rules the hotel sets, with approval, and on the record.
          </p>
          <p>
            We start small, because trust has to be earned: one everyday situation, a guest arriving to a room that is not ready. We publish what
            exists, and we call everything else a roadmap.
          </p>
          <p>
            HOS will only be useful if it is built together, by hotels and hotel groups, PMS and software vendors, integrators, developers and
            patrons. We invite you to build it with us.
          </p>
        </div>
        <Link className="mt-10 inline-block" href="/participate">
          <Button size="lg">Participate in HOS AI</Button>
        </Link>
      </article>
    </>
  );
}
