# HOS 0.1 — draft

Machine-readable artefacts of the HOS 0.1 drafts. The readable specifications are published at `/docs/core` (HOS Core 0.1) and `/docs/events` (HOS Events 0.1) on the HOS AI website, and the conformance scenarios can be replayed at `/demo`, `/demo/room-out-of-order` and `/demo/late-checkout`.

Status: draft for review. Names and fields may change before 0.1 is final. The specification text, published at `/docs/core` and `/docs/events`, is under CC BY 4.0; the schemas and every other file here are Apache-2.0. Every example is synthetic.

## Contents

- `schemas/core.schema.json` — HOS Core 0.1 definitions: identifiers, external references, extensions, sensitivity classes, the four-dimension Unit status model and the nine Core entities, maintenance windows included.
- `schemas/event-envelope.schema.json` — HOS Events 0.1 envelope profile: CloudEvents 1.0 structured JSON with HOS extension attributes.
- `schemas/events.schema.json` — HOS Events 0.1 catalogue: fifteen event types in five families, including snapshot mode for `unit.status_changed`.
- `schemas/producer-manifest.schema.json` — Event Producer manifests. A manifest carries no signature: its producer signs it with a detached JWS, as `/docs/events#signed-manifests` specifies.
- `schemas/reference/arrival-readiness.schema.json` — non-normative reference situations produced by the arrival-readiness projection.
- `examples/` — one valid event per type, plus Core entity examples in `examples/entities/`.
- `conformance/` — three conformance scenarios, each replayed through the arrival-readiness reference projection:
  - `arrival-readiness/` — an early arrival to a unit not yet released: thirteen deliveries from a PMS, a housekeeping system and a guest messaging platform;
  - `room-out-of-order/` — an assigned unit goes out of order on the arrival day: fourteen deliveries from a PMS, a housekeeping system and a maintenance system;
  - `late-checkout/` — a late check-out in a unit assigned to a same-day arrival: fifteen deliveries from a PMS and a housekeeping system.

  Each scenario holds the same files:
  - `scenario.json` — tenant and property profile, readiness rule, the cases covered and what each delivery checks;
  - `producers/*.json` — manifests of its synthetic producers;
  - `events.jsonl` — the deliveries, in delivery order, one CloudEvent per line;
  - `expected.json` — the dispositions, readiness and situations an implementation must reproduce.

- `conformance/PROTOCOL.md` — the `hos-conformance/1` protocol, through which `hos conformance run` replays the scenarios in an implementation written in any language and compares its answers with `expected.json`.

- `conformance/invalid/` — documents and streams a validator must reject, one case per file, and `conformance/valid/` — cases it must accept. Each case holds:
  - `description` — what the case shows;
  - `rule` — the rule it breaks or illustrates. Rules are named after the sections and principles of `/docs/core` and `/docs/events`, such as `events/minimal-data`, until the specification numbers them;
  - `document` — an event, a reference situation or a producer manifest; or `stream` — the lines of a JSON Lines stream, an object written as JSON and a string as it is, with the producers' `manifests` when the case needs them.

- `conformance/signing/` — test vectors for signed manifests, one per file. Each holds a `manifest`, its detached signature `jws` and the producer's key set `jwks`, the time `at` to verify at, and the `expected` verdict: `{ "valid": true }`, or `{ "valid": false, "error": ... }` with one of `malformed`, `unsupported_algorithm`, `unknown_key`, `unusable_key`, `bad_signature`, `expired` and `not_yet_valid`. The vectors cover both algorithms, an expired and a not-yet-valid signature, another key, a manifest changed after signing, an unknown `kid`, `alg: none` and a payload that is not detached. `conformance/signing/well-known/` holds what a fictional producer, `https://housekeeping.example`, serves under `/.well-known/hos/`: `manifest.json`, `manifest.jws` and `jwks.json`.

- `mappings/` — experimental, unofficial PMS mappings for Mews, Apaleo and Cloudbeds. For each PMS, the arrival scenario's PMS deliveries are recorded in that PMS's format: webhooks and the entities an integration fetches for them. Mapping notes sit alongside. Replayed through each reference adapter, the deliveries reach `expected.json`.

The schemas reference each other by `$id` (`urn:hos:schema:0.1:*`); load all of them into your validator.

## Running a conformance scenario

1. Load the producer manifests.
2. Replay `events.jsonl` in file order, applying the HOS Events 0.1 rules: deduplicate on source + id, order by occurrence time, process only declared capabilities, and let only the declared authority change a value.
3. For every delivery, compare the disposition and, for every known stay, its readiness and situation with `expected.json`.
4. Compare emitted situations on every attribute except `id` and `hosrecordedat`, which are implementation-defined.

`hos conformance run` does all of this for an implementation in any language, as `conformance/PROTOCOL.md` describes:

```sh
npx @hos-ai/cli conformance run --all --impl "python3 impl.py"
```

On Windows, where `python3` often does not exist, write `--impl "py impl.py"`.

A producer is checked on what it publishes: `hos conformance producer --manifest manifest.json --stream recording.jsonl --redelivery redelivery.jsonl` checks that its manifest is valid and states its limitations, that each fact is valid, published under the manifest's producer and declared for its property, that no source and id name two facts, and that a redelivery of the same data brings back the same facts with the same ids.

## Signing a manifest

A producer creates a key, signs its manifest and publishes the three files under `/.well-known/hos/`. It signs again before the signature expires, after 90 days by default:

```sh
npx @hos-ai/cli manifest keygen --key private-key.json --jwks jwks.json
npx @hos-ai/cli manifest sign manifest.json --key private-key.json
```

A consumer, or anyone, verifies a published manifest from its URL, with the keys its producer publishes on the same origin:

```sh
npx @hos-ai/cli manifest verify https://housekeeping.example/.well-known/hos/manifest.json
```
