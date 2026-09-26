import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Wordmark } from "@/components/brand/hos-mark";
import { LegalText } from "@/components/legal/legal-document";
import { publisher } from "@/lib/legal";
import { siteConfig } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)]">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 lg:grid-cols-[1.3fr_1fr_1fr] lg:px-8">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-sm text-sm leading-6 text-[var(--muted-foreground)]">
            An early-stage initiative working toward an independent HOS Foundation.
          </p>
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Project</p>
          <div className="mt-3 flex flex-col gap-2 text-sm">
            <Link href="/manifesto">Manifesto</Link>
            <Link href="/standard/htng-opentravel">HOS, HTNG and OpenTravel</Link>
            <Link href="/governance">Governance</Link>
            <Link href="/participate">Participate</Link>
            <Link href="/contact">Contact</Link>
          </div>
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Trust</p>
          <div className="mt-3 flex flex-col gap-2 text-sm">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms of use</Link>
            <Link href="/legal">Legal notice</Link>
            <Link href="/accessibility">Accessibility</Link>
            <a className="inline-flex items-center gap-1" href={siteConfig.githubUrl} rel="noreferrer" target="_blank">
              GitHub <ArrowUpRight aria-hidden="true" size={13} />
            </a>
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--border)] px-5 py-5 text-center font-mono text-[0.68rem] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
        © {new Date().getFullYear()} <LegalText value={publisher.name} /> · HOS AI · Early-stage initiative
      </div>
    </footer>
  );
}
