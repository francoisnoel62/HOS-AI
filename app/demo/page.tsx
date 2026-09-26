import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { SectionFrame } from "@/components/content/section-frame";
import { SpecTable } from "@/components/content/spec-table";
import { ScenarioDemo, scenarioMetadata } from "@/components/demo/scenario-demo";
import { Card } from "@/components/ui/card";
import { pmsComparison, pmsMappingCopy } from "@/lib/content/pms-mappings";
import { pmsMappings } from "@/lib/hos/mappings/replay";

export const metadata: Metadata = scenarioMetadata("arrival-readiness");

export default function DemoPage() {
  return (
    <>
      <ScenarioDemo id="arrival-readiness" />
      <SectionFrame
        eyebrow="Real PMS formats · Experimental"
        id="pms-mappings"
        title="The same arrival, from three real PMS APIs."
        description="The same early arrival, with the PMS side written exactly as Mews, Apaleo or Cloudbeds would send it. An unofficial connector translates it for HOS, and the outcome is the same. The data here is made up; the Mews and Apaleo connectors have also run, read-only, on those PMSs' live demo hotels. Cloudbeds has not yet."
      >
        <div className="grid gap-3 md:grid-cols-3">
          {pmsMappings.map((pms) => (
            <Link className="group" href={`/demo/${pms}`} key={pms}>
              <Card className="flex h-full flex-col p-5 transition-colors group-hover:border-[var(--border-strong)]">
                <p className="eyebrow">{pmsMappingCopy[pms].api}</p>
                <h3 className="mt-3 text-xl font-semibold">{pmsMappingCopy[pms].name}</h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-[var(--muted-foreground)]">{pmsMappingCopy[pms].description}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm text-[var(--accent-strong)]">
                  Replay from {pmsMappingCopy[pms].name} <ArrowRight aria-hidden="true" size={14} />
                </span>
              </Card>
            </Link>
          ))}
        </div>
        <div className="mt-8">
          <SpecTable
            columns={["What mattered", ...pmsMappings.map((pms) => pmsMappingCopy[pms].name)]}
            label="How the three PMS APIs compare for the arrival scenario"
            minWidth="48rem"
            rows={pmsComparison.map(([question, ...answers]) => ({ key: question, cells: [question, ...answers] }))}
          />
        </div>
      </SectionFrame>
    </>
  );
}
