# HOS 0.1 — draft

Machine-readable artefacts of the HOS Core 0.1 draft. The readable specification is published at `/docs/core` on the HOS AI website, and the scenario can be replayed at `/demo`.

Status: draft for review. Names and fields may change before 0.1 is final. The specification is intended for publication under CC BY 4.0. Every example is synthetic.

## Contents

- `schemas/hos-event.schema.json` — JSON Schema (2020-12) for HOS 0.1 events: the CloudEvents envelope with HOS extension attributes, five fact types and two projection situations.
- `schemas/producer-manifest.schema.json` — JSON Schema for Event Producer manifests.
- `conformance/arrival-readiness/` — the early-arrival, room-not-ready conformance scenario:
  - `scenario.json` — property profile, readiness rule and what each delivery checks;
  - `producers/*.json` — manifests of the three synthetic producers;
  - `events.jsonl` — nine deliveries, in delivery order, one CloudEvent per line;
  - `expected.json` — the dispositions, readiness and situations an implementation must reproduce.

## Running the conformance scenario

1. Load the producer manifests.
2. Replay `events.jsonl` in file order.
3. For every delivery, compare the disposition and, for every known stay, its readiness and situation with `expected.json`.
4. Compare emitted situations on every attribute except `id` and `hosrecordedat`, which are implementation-defined.
