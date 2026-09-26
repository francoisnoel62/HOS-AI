# @hos-ai/sdk

TypeScript types, validation and processing rules for [HOS 0.1](https://hos-ai.vercel.app/docs), an open draft standard for hotel operations events: HOS Core for the entities, HOS Events for the facts that systems publish about them. The SDK also creates facts with stable ids, and signs and verifies producer manifests. It runs in Node and in a browser.

> **Draft and alpha.** HOS 0.1 is a draft, `0.1.0-draft.2`, and this package is an alpha: its API may still change. The versions stay `0.1.0-alpha.N` until HOS 0.1 is final, and the compatibility policy applies from then on.

The same checks are available from the command line in [@hos-ai/cli](https://www.npmjs.com/package/@hos-ai/cli).

## Install

Node.js 22 or later, or a current browser through a bundler. The package is ESM only.

```sh
npm install @hos-ai/sdk
```

It has three entry points:

| Import                  | What it holds                                                                                                                                    |
| :---------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| `@hos-ai/sdk`           | types, validation, processing rules, fact creation and manifest signing. The schemas are embedded: no file is read, so it runs in a browser too. |
| `@hos-ai/sdk/node`      | loaders for a conformance scenario published as files: `loadScenario`, `loadExpectedOutcome`                                                     |
| `@hos-ai/sdk/reference` | `replayArrivalReadiness`, the arrival-readiness reference projection. It is non-normative.                                                       |

## Validate

`validate` recognises an event, a producer manifest or a reference situation, and checks it against the HOS 0.1 schemas:

```ts
import { validate } from "@hos-ai/sdk";

const result = validate(JSON.parse(text));
if (!result.valid) {
  for (const error of result.errors) console.log(`${error.path}: ${error.message}`);
}
```

```text
/data/current: data.current is "cleaning", not one of: dirty, clean, inspected, unknown. Readiness as reported by the housekeeping authority.
```

`result.kind` says what the document is (`"event"`, `"manifest"` or `"situation"`), and each error has the `rule` of the specification it breaks. The types of HOS documents are exported, generated from the schemas: `HosFact`, `ProducerManifest`, and one type per event, such as `UnitStatusChanged`. Give a document its type once `validate` accepts it.

`validateStream` checks a stream in JSON Lines, and the events against their producers' manifests:

```ts
import { validateStream } from "@hos-ai/sdk";

const stream = validateStream(jsonl, { manifests: [pms, housekeeping, messaging] });
for (const issue of stream.issues) console.log(`line ${issue.line} ${issue.severity}: ${issue.message}`);
```

```text
line 5 info: Repeats line 4: same source, id and content. A consumer discards it as a duplicate.
line 7 error: urn:hos:pms:demo does not declare housekeeping.task.created at prop_demo: a consumer ignores this event (undeclared_capability).
```

## Create facts

A producer turns what its system knows into HOS facts. HOS ids are opaque, never the source system's own ids, so they survive a migration of that system: the identity registry keeps the crosswalk between the two. And the same source event always gets the same fact id, so a consumer discards a redelivery as a duplicate.

```ts
import { createFactWriter, createIdentityRegistry } from "@hos-ai/sdk";

// Keep the crosswalk from one run to the next, so the same room keeps the same HOS id.
const ids = createIdentityRegistry(savedCrosswalk);
const facts = createFactWriter({
  source: "urn:hos:housekeeping:example",
  tenant: "tenant_example",
  propertyId: "prop_example",
  timezone: "Europe/Paris",
  recordedAt: new Date().toISOString(),
  idPrefix: "hk",
});

const unit = ids.resolve("unit", "ROOM-204");
facts.publish("unit.status_changed", "ROOM-204", "2026-07-30T06:40:00Z", [`unit:${unit}`], {
  unit_id: unit,
  dimension: "housekeeping",
  current: "dirty",
  authority_source: "urn:hos:housekeeping:example",
});

facts.events; // valid HOS facts, with every envelope attribute filled in
```

## Process facts

HOS Events 0.1 asks every consumer to decide the same thing for each delivery: apply it, or discard it as a `duplicate`, `superseded` by a later fact, `non_authoritative`, or `undeclared_capability`. The SDK exports the rules behind those decisions:

- `factKey` is the identity of a fact, its source and id, on which consumers deduplicate;
- `isLater` and `byOccurrence` order facts by occurrence time, then source, then id;
- `findDeclaration` finds the manifest entry that declares a fact for its property;
- `authority` says whether a fact comes from the declared authority, from another declared producer, or from nobody who declared it.

`replayArrivalReadiness`, in `@hos-ai/sdk/reference`, applies them to a whole stream and reads arrivals from it:

```ts
import { replayArrivalReadiness } from "@hos-ai/sdk/reference";

const steps = replayArrivalReadiness(events, manifests, { ready_housekeeping_statuses: ["clean", "inspected"] });
for (const step of steps)
  console.log(
    step.delivery,
    step.disposition,
    step.emitted.map((situation) => situation.type),
  );
```

```text
9 non_authoritative []
10 applied [ 'arrival.room_readiness_at_risk' ]
11 superseded []
12 applied [ 'arrival.room_readiness_resolved' ]
```

The dispositions follow the normative rules. The readiness of each stay and the situations are one reading of arrivals, the reference projection, which is non-normative: an implementation may assess arrivals differently and still conform.

## Check a producer

`checkProducer` checks what a producer publishes: its manifest is valid and states its limitations, each fact is valid, published under the manifest's producer and declared for its property, no source and id name two different facts, and a redelivery of the same data brings back the same facts with the same ids.

```ts
import { checkProducer } from "@hos-ai/sdk";

const check = checkProducer({ manifest, recording, redelivery });
console.log(check.valid, check.recording.issues);
```

`recording` and `redelivery` are JSON Lines, as a producer would record them.

## Sign and verify a manifest

A producer signs its manifest with a detached JWS on its canonical form (RFC 8785), with Ed25519 or ES256, and publishes the public key in a key set:

```ts
import { generateManifestKey, signManifest, verifyManifest } from "@hos-ai/sdk";

const { privateJwk, publicJwk } = await generateManifestKey(); // Ed25519, or { alg: "ES256" }
const jws = await signManifest(manifest, privateJwk, { expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000) });

const result = await verifyManifest(manifest, jws, { keys: [publicJwk] });
console.log(result.valid ? `signed with ${result.header.kid}` : `${result.error}: ${result.message}`);
```

A failed verification gives its reason in `result.error`: `malformed`, `unsupported_algorithm`, `unknown_key`, `unusable_key`, `bad_signature`, `expired` or `not_yet_valid`. A manifest changed after signing gives:

```text
bad_signature: The signature does not match this manifest and key …: the manifest changed after it was signed, or another key signed it.
```

Keep the private key secret, and out of version control.

## Conformance scenarios

HOS publishes conformance scenarios: a stream of deliveries from several producers, their manifests, and the expected outcome of each delivery. In Node, `loadScenario(directory)` reads one, and `toExpectedOutcome` turns replay steps into the same shape as `expected.json`. To test an implementation in another language, use `hos conformance run` from [@hos-ai/cli](https://www.npmjs.com/package/@hos-ai/cli).

## Problems and questions

[Open an issue](https://github.com/francoisnoel62/HOS-AI/issues/new/choose) with the template for the CLI and the SDK: the package version, `node --version`, your system, a short piece of code that shows the problem, and what it prints. Use synthetic data only: never real guest data, credentials or private keys.

## Links

- [HOS 0.1 documentation](https://hos-ai.vercel.app/docs): HOS Core, HOS Events and their schemas
- [Changelog](https://github.com/francoisnoel62/HOS-AI/blob/master/packages/sdk/CHANGELOG.md) and [source](https://github.com/francoisnoel62/HOS-AI/tree/master/packages/sdk)

## License

[Apache-2.0](https://github.com/francoisnoel62/HOS-AI/blob/master/packages/sdk/LICENSE), like the HOS schemas the package embeds. The text of the specification is published under CC BY 4.0 on the HOS website and is not part of this package.
