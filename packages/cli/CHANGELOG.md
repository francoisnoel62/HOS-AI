# Changelog

Every notable change to `@hos-ai/cli`. The versions stay `0.1.0-alpha.N` until HOS 0.1 is final: until then, any release may change the commands, their options and their messages.

## 0.1.0-alpha.1 (unreleased)

The first release on npm. It implements HOS Core 0.1 and HOS Events 0.1, draft `0.1.0-draft.2`, and carries the three conformance scenarios so it works offline.

- `hos validate`: events, producer manifests and reference situations (`.json`), and event streams (`.jsonl`), checked against their producers' manifests with `--manifest`.
- `hos replay`: a recorded stream through the reference projection, delivery by delivery.
- `hos conformance list` and `hos conformance run`: the scenarios through an implementation in any language, with the protocol `hos-conformance/1`, at the `normative` or `reference` level, with `--json` and `--junit` reports.
- `hos conformance producer`: a producer's recorded facts, and a redelivery of the same data, against its manifest.
- `hos manifest keygen`, `sign` and `verify`: signed producer manifests, verified from files or from their URL.
