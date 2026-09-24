import type { Metadata } from "next";
import { Download } from "lucide-react";
import Link from "next/link";

import { CodePanel } from "@/components/content/code-panel";
import { DraftNotice } from "@/components/content/draft-notice";
import { PageHero } from "@/components/content/page-hero";
import { SectionFrame } from "@/components/content/section-frame";
import { SpecTable } from "@/components/content/spec-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { examplesPath, specVersionPath } from "@/lib/hos/conformance";
import coreSchema from "@/public/spec/0.1/schemas/core.schema.json";
import unitExample from "@/public/spec/0.1/examples/entities/unit.json";

export const metadata: Metadata = {
  title: "HOS Core 0.1 (draft)",
  description: "The operational minimum of HOS 0.1: eight Core entities, opaque identifiers, typed external references, the four-dimension Unit status model, time rules and extensions.",
};

type SchemaNode = { title?: string; description?: string; enum?: string[]; required?: string[]; "x-hos-boundary"?: string };

const definitions = (coreSchema as unknown as { $defs: Record<string, SchemaNode> }).$defs;
const entities = ["Tenant", "Property", "Unit", "Reservation", "Stay", "Task", "Guest", "Message"].map((name) => definitions[name]);
const dimensions = [
  ["occupancy", "occupancyStatus"],
  ["housekeeping", "housekeepingStatus"],
  ["maintenance", "maintenanceStatus"],
  ["commercial", "commercialStatus"],
].map(([dimension, definition]) => ({ dimension, ...definitions[definition] }));

export default function CoreSpecificationPage() {
  return (
    <>
      <PageHero
        eyebrow="Documentation · HOS Core"
        title="HOS Core 0.1"
        description="The operational minimum that makes the first arrival-readiness scenario portable: eight entities, opaque identifiers, typed external references, a four-dimension Unit status model, and extensions that can never corrupt the Core."
        badge="Draft · Observe"
      />
      <section className="mx-auto max-w-6xl px-5 lg:px-8">
        <DraftNotice />
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/docs/events">
            <Button>Continue with HOS Events 0.1</Button>
          </Link>
          <a download href={`${specVersionPath}/schemas/core.schema.json`}>
            <Button variant="secondary">
              <Download aria-hidden="true" size={15} /> Core schema
            </Button>
          </a>
        </div>
      </section>

      <SectionFrame eyebrow="Scope" title="What Core 0.1 covers, and what it deliberately leaves out.">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-6">
            <Badge variant="active">In Core 0.1</Badge>
            <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">Eight entities, identifiers and external references, the Unit status model, time rules, sensitivity classes and extensions. Facts about them are specified in HOS Events 0.1.</p>
          </Card>
          <Card className="p-6">
            <Badge>Not yet</Badge>
            <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">Commands in 0.2, policies and audit in 0.3, agent manifests in 0.4, certification. They open only when the evidence supports them.</p>
          </Card>
          <Card className="p-6">
            <Badge variant="success">Always</Badge>
            <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">No database, cloud, language or broker is prescribed. Authority stays with the system of record. Data is minimal and pseudonymous.</p>
          </Card>
        </div>
      </SectionFrame>

      <SectionFrame id="entities" eyebrow="Core entities" title="Eight entities, each with a narrow meaning and a clear boundary.">
        <SpecTable
          columns={["Entity", "Minimum HOS 0.1 data", "Boundary", "Required fields"]}
          label="HOS Core 0.1 entities"
          minWidth="44rem"
          rows={entities.map((entity) => ({
            key: entity.title!,
            cells: [entity.title, entity.description, entity["x-hos-boundary"], <span className="font-mono text-xs" key="fields">{entity.required?.join(", ")}</span>],
          }))}
        />
      </SectionFrame>

      <SectionFrame id="identifiers" eyebrow="Identifiers and references" title="Opaque inside HOS, typed and sourced outside it.">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-6">
            <h3 className="font-semibold">Opaque identifiers</h3>
            <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{definitions.hosId.description}</p>
          </Card>
          <Card className="p-6">
            <h3 className="font-semibold">External references</h3>
            <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
              A vendor identifier travels as a typed reference: the source system, the identifier type, the source identifier and, where known, whether it was verified with the source.
            </p>
          </Card>
          <Card className="p-6">
            <h3 className="font-semibold">Guest identity</h3>
            <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
              HOS issues no global person identity. Matching two guest references creates a reversible link that names its source, confidence, author and rationale; records are linked, never merged.
            </p>
          </Card>
        </div>
      </SectionFrame>

      <SectionFrame id="unit-status" eyebrow="Unit status model" title="A unit has four independent statuses, not one ambiguous availability." description="Each dimension is normalized and changes on its own; every one of them can be unknown. Vendor detail stays in extensions.">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <SpecTable
            columns={["Dimension", "Core values", "Meaning"]}
            label="Unit status dimensions"
            rows={dimensions.map((item) => ({ key: item.dimension, cells: [item.dimension, <span className="font-mono text-xs" key="values">{item.enum?.join(" / ")}</span>, item.description] }))}
          />
          <div className="min-w-0">
            <CodePanel code={JSON.stringify(unitExample, null, 2)} label="Unit · synthetic" />
            <p className="mt-3 text-sm">
              <a className="text-[var(--accent-strong)] underline" download href={`${examplesPath}/entities/unit.json`}>
                Download the Unit example
              </a>
            </p>
          </div>
        </div>
      </SectionFrame>

      <SectionFrame id="time-extensions" eyebrow="Time, extensions and sensitivity" title="No ambiguous local time, no redefined Core field.">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-6">
            <h3 className="font-semibold">Time</h3>
            <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
              Occurrence and recording times use RFC 3339. The Property declares an IANA time zone and a business-date policy, and the business date is explicit whenever it matters.
            </p>
          </Card>
          <Card className="p-6">
            <h3 className="font-semibold">Extensions</h3>
            <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{definitions.extensions.description}</p>
          </Card>
          <Card className="p-6">
            <h3 className="font-semibold">Sensitivity classes</h3>
            <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{definitions.sensitivityClass.description}</p>
          </Card>
        </div>
      </SectionFrame>
    </>
  );
}
