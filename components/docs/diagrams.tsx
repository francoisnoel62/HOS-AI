import { ArrowDown, ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// The diagrams of the tools documentation (docs/plans/PLAN-SDK-DOC.md, §6), in HTML rather than pictures: their text is
// read by screen readers and search, they follow the light and dark themes, and they stack on a phone. Each is a
// figure whose caption says what it shows.

function Figure({ caption, children, className }: { caption: string; children: ReactNode; className?: string }) {
  return (
    <figure className={cn("my-8 rounded-md border border-[var(--border)] bg-[var(--muted)] p-4 sm:p-5", className)}>
      {children}
      <figcaption className="mt-4 text-xs leading-5 text-[var(--muted-foreground)]">{caption}</figcaption>
    </figure>
  );
}

function Box({ title, children, tone = "plain" }: { title: ReactNode; children?: ReactNode; tone?: "plain" | "accent" | "success" | "danger" }) {
  return (
    <div
      className={cn(
        "min-w-0 flex-1 rounded-md border bg-[var(--card)] p-3 text-sm",
        tone === "accent" && "border-[var(--accent)]",
        tone === "success" && "border-[var(--success)]",
        tone === "danger" && "border-[var(--danger)]",
        tone === "plain" && "border-[var(--border-strong)]",
      )}
    >
      <p className="font-semibold">{title}</p>
      {children ? <div className="mt-1 leading-6 text-[var(--muted-foreground)]">{children}</div> : null}
    </div>
  );
}

// Right on wide screens, down when the boxes stack, or always down in a vertical flow.
function Arrow({ label, vertical = false }: { label?: string; vertical?: boolean }) {
  return (
    <div aria-hidden="true" className="flex shrink-0 flex-col items-center justify-center gap-0.5 text-[var(--muted-foreground)]">
      <ArrowDown className={vertical ? undefined : "md:hidden"} size={18} />
      {vertical ? null : <ArrowRight className="hidden md:block" size={18} />}
      {label ? <span className="font-mono text-[0.65rem]">{label}</span> : null}
    </div>
  );
}

function Row({ children, vertical = false }: { children: ReactNode; vertical?: boolean }) {
  return <div className={cn("flex flex-col items-stretch gap-2", !vertical && "md:flex-row md:items-center")}>{children}</div>;
}

const code = (text: string) => <code className="font-mono text-[0.8em]">{text}</code>;

// D1: producers, facts, consumers, and what checks each side.
export function ToolsFitDiagram() {
  return (
    <Figure caption="Producers publish HOS facts and declare them in a signed manifest; consumers decide what to do with each fact. The hos command and the SDK check both sides.">
      <Row>
        <Box title="Producers">A PMS, a housekeeping app, a messaging platform. They publish facts, and a manifest of what they publish.</Box>
        <Arrow label="facts" />
        <Box title="HOS facts" tone="accent">
          CloudEvents, one per thing that happened, delivered at least once.
        </Box>
        <Arrow label="facts" />
        <Box title="Consumers">A dashboard, an operations app, an AI assistant. They decide what to do with each fact.</Box>
      </Row>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <Box title="Check a producer">
          {code("hos validate")}, {code("hos conformance producer")}, {code("hos manifest")}; in code, {code("createFactWriter")} and{" "}
          {code("checkProducer")}.
        </Box>
        <Box title="Check a consumer">{code("hos conformance run")}, in any language; in code, the processing rules of the SDK.</Box>
      </div>
    </Figure>
  );
}

// D6: the five dispositions, in the order HOS Events decides them.
export function DispositionsDiagram() {
  const steps: Array<[string, string, string]> = [
    ["Same source and id as a fact already received?", "yes", "duplicate"],
    ["Declared by its producer's manifest, for this hotel?", "no", "undeclared_capability"],
    ["Is its producer the authority on it?", "no", "non_authoritative"],
    ["Is a later fact about the same thing already known?", "yes", "superseded"],
  ];
  return (
    <Figure caption="For each fact it receives, a consumer asks four questions in this order. The first answer that stops it gives the disposition; a fact that passes all four is applied.">
      <ol className="space-y-2">
        {steps.map(([question, answer, disposition], index) => (
          <li className="flex flex-col gap-2 md:flex-row md:items-center" key={disposition}>
            <Box title={`${index + 1}. ${question}`} />
            <Arrow label={answer} />
            <div className="shrink-0 rounded-md border border-[var(--border-strong)] bg-[var(--card)] px-3 py-2 font-mono text-sm md:w-56">
              {disposition}
            </div>
          </li>
        ))}
        <li className="flex flex-col gap-2 md:flex-row md:items-center">
          <Box title="None of the above" />
          <Arrow />
          <div className="shrink-0 rounded-md border border-[var(--success)] bg-[var(--card)] px-3 py-2 font-mono text-sm md:w-56">applied</div>
        </li>
      </ol>
    </Figure>
  );
}

// D5: one document per file, or one per line.
export function JsonLinesDiagram() {
  const line = "rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 font-mono text-xs";
  return (
    <Figure caption="A .json file holds one document, which may span many lines. A .jsonl file holds one document per line, each complete on its own, such as a stream of facts in delivery order.">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <p className="font-mono text-xs text-[var(--muted-foreground)]">stay.expected.json</p>
          <pre className="mt-2 rounded border border-[var(--border)] bg-[var(--card)] p-2 font-mono text-xs leading-5">
            {'{\n  "specversion": "1.0",\n  "id": "pms-000421",\n  "type": "stay.expected",\n  ...\n}'}
          </pre>
        </div>
        <div>
          <p className="font-mono text-xs text-[var(--muted-foreground)]">events.jsonl</p>
          <div className="mt-2 space-y-1">
            {["pms-000312", "pms-000421", "pms-000422", "hk-002231"].map((id, index) => (
              <p className={line} key={id}>
                <span className="text-[var(--muted-foreground)]">{index + 1} </span>
                {`{"id":"${id}", ...}`}
              </p>
            ))}
          </div>
        </div>
      </div>
    </Figure>
  );
}

// D13: the parts of a line of hos output.
export function OutputLineDiagram() {
  const mark = (number: number, text: string, className = "") => (
    <span className={cn("rounded-sm outline outline-1 outline-[var(--code-link)]", className)}>
      {text}
      <sup className="ml-0.5 font-sans text-[0.65rem] text-[var(--code-link)]">{number}</sup>
    </span>
  );
  return (
    <Figure caption="The parts of a report of hos validate: the summary, the level, the message, the rule and the path.">
      <pre className="overflow-x-auto rounded-md bg-[var(--code)] p-3 font-mono text-xs leading-7 text-[var(--code-foreground)]" tabIndex={0}>
        {mark(1, "✗ unit.status_changed.json: invalid event unit.status_changed (1 error)")}
        {"\n  "}
        {mark(2, "error", "text-[var(--code-danger)]")}
        {"   "}
        {mark(3, 'data.current is "cleaning", not one of: dirty, clean, inspected, unknown.')}
        {"\n          "}
        {mark(4, "rule core/unit-status-model")}
        {" · "}
        {mark(5, "at /data/current")}
      </pre>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
        <li>The verdict, the file, what it is, and how many problems.</li>
        <li>The level: error, warning or note.</li>
        <li>The field, the value found, and what HOS allows.</li>
        <li>The rule it breaks, linked to its explanation.</li>
        <li>Where the field is, from the top of the JSON.</li>
      </ol>
    </Figure>
  );
}

// D8: the exchange of hos-conformance/1.
export function ProtocolDiagram() {
  const rows: Array<[string, "right" | "left" | "none", string]> = [
    ["starts the command given after --impl, in the current folder", "right", ""],
    [
      "writes the scenario line, one line per manifest, one per delivery, then closes standard input",
      "right",
      "reads everything, until the end of its input",
    ],
    ["", "left", "writes one answer per delivery to standard output, then exits with code 0"],
    ["compares the answers with expected.json, and reports every difference", "none", ""],
  ];
  return (
    <Figure caption="hos and the program under test exchange JSON Lines over standard input and standard output, once per scenario. After the timeout, 30 seconds by default, hos stops the program.">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2 gap-y-2 text-sm">
        <p className="font-semibold">hos</p>
        <span />
        <p className="font-semibold">Your program</p>
        {rows.map(([left, direction, right], index) => (
          <div className="contents" key={index}>
            <div className={cn("p-2 leading-6", left && "rounded-md border border-[var(--border-strong)] bg-[var(--card)]")}>{left}</div>
            <div aria-hidden="true" className="flex items-center text-[var(--muted-foreground)]">
              {direction === "right" ? <ArrowRight size={18} /> : direction === "left" ? <ArrowLeft size={18} /> : null}
            </div>
            <div className={cn("p-2 leading-6", right && "rounded-md border border-[var(--border-strong)] bg-[var(--card)]")}>{right}</div>
          </div>
        ))}
      </div>
    </Figure>
  );
}

// D10: a redelivery brings back the same facts.
export function RedeliveryDiagram() {
  const ids = ["pms-000312", "pms-000421", "pms-000422"];
  const cell = "rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 font-mono text-xs";
  return (
    <Figure caption="A producer restarted on the same data publishes the same facts, with the same ids and content, which consumers discard as duplicates. A fact under a new id, or with changed content, would count twice.">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-1.5">
        <p className="font-mono text-xs text-[var(--muted-foreground)]">recording.jsonl</p>
        <span />
        <p className="font-mono text-xs text-[var(--muted-foreground)]">redelivery.jsonl</p>
        {ids.map((id) => (
          <div className="contents" key={id}>
            <p className={cell}>{id}</p>
            <Check aria-label="same id and content" role="img" className="text-[var(--success)]" size={16} />
            <p className={cell}>{id}</p>
          </div>
        ))}
        <p className={cell}>pms-000455</p>
        <X aria-label="not in the recording" role="img" className="text-[var(--danger)]" size={16} />
        <p className={cn(cell, "border-[var(--danger)]")}>pms-000999</p>
      </div>
    </Figure>
  );
}

// D11: signing, publishing and verifying a manifest.
export function SigningDiagram() {
  return (
    <Figure caption="The producer signs its manifest with its private key, which never leaves it, and publishes three files under /.well-known/hos/. A consumer fetches them and checks the signature with the public key the signature names.">
      <Row>
        <Box title="The producer">
          {code("private-key.json")}, kept secret, signs {code("manifest.json")} with {code("hos manifest sign")}.
        </Box>
        <Arrow label="publishes" />
        <Box title="/.well-known/hos/" tone="accent">
          {code("manifest.json")}, {code("manifest.jws")} and {code("jwks.json")}, over HTTPS.
        </Box>
        <Arrow label="fetches" />
        <Box title="A consumer">Finds the key by its kid in jwks.json, and checks that the signature matches the manifest and has not expired.</Box>
      </Row>
    </Figure>
  );
}

// D12: changing keys without breaking signatures.
export function RotationDiagram() {
  const bar = "h-3 rounded-full";
  return (
    <Figure caption="Changing keys: the new key joins the key set before it signs; the old key stays in the set until the last signature it made has expired, then leaves it.">
      <div className="grid grid-cols-[6rem_1fr] items-center gap-x-3 gap-y-3 text-xs">
        <span className="font-mono">key 1</span>
        <div className="relative h-3">
          <div className={cn(bar, "absolute left-0 w-[70%] bg-[var(--border-strong)]")} title="in the key set" />
          <div className={cn(bar, "absolute left-0 w-[35%] bg-[var(--accent)]")} title="signs" />
        </div>
        <span className="font-mono">key 2</span>
        <div className="relative h-3">
          <div className={cn(bar, "absolute left-[30%] right-0 bg-[var(--border-strong)]")} />
          <div className={cn(bar, "absolute left-[35%] right-0 bg-[var(--accent)]")} />
        </div>
      </div>
      <ul className="mt-4 flex flex-wrap gap-4 text-xs text-[var(--muted-foreground)]">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-5 rounded-full bg-[var(--accent)]" /> signs the manifest
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-5 rounded-full bg-[var(--border-strong)]" /> in the published key set
        </li>
      </ul>
    </Figure>
  );
}

// D16: what an adapter does with each source event.
export function AdapterDiagram() {
  return (
    <Figure caption="An adapter maps each source event to a HOS type and HOS values, gives entities their HOS ids from its crosswalk, lets the SDK write the fact, validates it, and publishes it. In tests, checkProducer checks the whole.">
      <Row vertical>
        <Box title="Source event">A webhook of the system, such as a room status.</Box>
        <Arrow vertical />
        <Box title="Map">The HOS type and values, or nothing when HOS has no equivalent.</Box>
        <Arrow vertical />
        <Box title="Identify">{code("createIdentityRegistry")}, with the saved crosswalk.</Box>
        <Arrow vertical />
        <Box title="Write">{code("createFactWriter")} fills in the envelope.</Box>
        <Arrow vertical />
        <Box title="Validate" tone="accent">
          {code("validate")}, then publish.
        </Box>
      </Row>
    </Figure>
  );
}

// D17: the checks of a CI workflow.
export function CiDiagram() {
  return (
    <Figure caption="On every change, and every morning: the pinned version of hos, the conformance scenarios, the producer check on what the adapter publishes, and the published manifest verified 30 days ahead. Any exit code other than 0 fails the run.">
      <Row vertical>
        <Box title="Trigger">A push, a pull request, or every morning.</Box>
        <Arrow vertical />
        <Box title="Install">{code("npm ci")}, with the exact version of hos.</Box>
        <Arrow vertical />
        <Box title="Consumer">{code("hos conformance run")}, with a JUnit report.</Box>
        <Arrow vertical />
        <Box title="Producer">{code("hos conformance producer")} on a recording and a redelivery.</Box>
        <Arrow vertical />
        <Box title="Manifest" tone="accent">
          {code("hos manifest verify --at")} 30 days ahead.
        </Box>
      </Row>
    </Figure>
  );
}
