# Changelog

Every notable change to `@hos-ai/sdk`. The versions stay `0.1.0-alpha.N` until HOS 0.1 is final: until then, any release may change the API.

## 0.1.0-alpha.1 (unreleased)

The first release on npm. It implements HOS Core 0.1 and HOS Events 0.1, draft `0.1.0-draft.2`.

- **Types** generated from the HOS 0.1 schemas: `HosFact`, `ProducerManifest`, one type per event, and the HOS Core entities.
- **Validation** against the embedded schemas, with messages that name the field, the value and the rule: `validate`, `validateStream` for JSON Lines checked against the producers' manifests, and one validator per schema.
- **Processing rules** of HOS Events 0.1: `factKey`, `isLater`, `byOccurrence`, `findDeclaration`, `authority` and `statusChanges`.
- **Fact creation** with opaque, stable ids: `createIdentityRegistry` and `createFactWriter`, with the time helpers `utc`, `localDate` and `zonedTimeToUtc`.
- **Producer check**: `checkProducer`, on a recording and a redelivery of the same data.
- **Signed manifests**: `generateManifestKey`, `signManifest`, `verifyManifest` and `canonicalize` (RFC 8785), with Ed25519 and ES256.
- **Conformance scenarios**: `parseJsonLines` and `toExpectedOutcome`, and the loaders `loadScenario` and `loadExpectedOutcome` in `@hos-ai/sdk/node`.
- **Reference projection**: `replayArrivalReadiness` in `@hos-ai/sdk/reference`, non-normative.
