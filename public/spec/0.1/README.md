# HOS 0.1 — draft

Machine-readable artefacts of the HOS 0.1 drafts. The readable specifications are published at `/docs/core` (HOS Core 0.1) and `/docs/events` (HOS Events 0.1) on the HOS AI website, and the conformance scenario can be replayed at `/demo`.

Status: draft for review. Names and fields may change before 0.1 is final. The specification is intended for publication under CC BY 4.0; schemas are Apache-2.0. Every example is synthetic.

## Contents

- `schemas/core.schema.json` — HOS Core 0.1 definitions: identifiers, external references, extensions, sensitivity classes, the four-dimension Unit status model and the eight Core entities.
- `schemas/event-envelope.schema.json` — HOS Events 0.1 envelope profile: CloudEvents 1.0 structured JSON with HOS extension attributes.
- `schemas/events.schema.json` — HOS Events 0.1 catalogue: eleven event types in five families, including snapshot mode for `unit.status_changed`.
- `schemas/producer-manifest.schema.json` — Event Producer manifests. Signing is still in progress.
- `schemas/reference/arrival-readiness.schema.json` — non-normative reference situations produced by the arrival-readiness projection.
- `examples/` — one valid event per type, plus Core entity examples in `examples/entities/`.
- `conformance/arrival-readiness/` — the early-arrival, unit-not-ready conformance scenario:
  - `scenario.json` — tenant and property profile, readiness rule, the cases covered and what each delivery checks;
  - `producers/*.json` — manifests of the three synthetic producers;
  - `events.jsonl` — thirteen deliveries, in delivery order, one CloudEvent per line;
  - `expected.json` — the dispositions, readiness and situations an implementation must reproduce.

The schemas reference each other by `$id` (`urn:hos:schema:0.1:*`); load all of them into your validator.

## Running the conformance scenario

1. Load the producer manifests.
2. Replay `events.jsonl` in file order, applying the HOS Events 0.1 rules: deduplicate on source + id, order by occurrence time, process only declared capabilities, and let only the declared authority change a value.
3. For every delivery, compare the disposition and, for every known stay, its readiness and situation with `expected.json`.
4. Compare emitted situations on every attribute except `id` and `hosrecordedat`, which are implementation-defined.
