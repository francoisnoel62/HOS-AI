# HOS 0.2 — draft

Machine-readable artefacts of the HOS 0.2 draft, which opens the Act stage of the HOS roadmap: **HOS Commands 0.2**, controlled requests that a person approves, that the system holding the authority executes, and that its own facts confirm. HOS 0.2 is HOS Core 0.1 and HOS Events 0.1, unchanged, plus HOS Commands 0.2 and three event types.

Status: draft for review, `0.2.0-draft.1`. Names and fields may change before 0.2 is final, and no operator, vendor or integrator has reviewed it yet. The specification text will be published at `/docs/commands` under CC BY 4.0; the schemas and every other file here are Apache-2.0. Every example is synthetic. The mappings of HOS 0.1 for Mews and Apaleo stay experimental and unofficial, and nothing here is a certification.

## What it holds

A command is a document, never an event: it asks for a future mutation. Its lifecycle — `proposed`, `pending_approval`, `approved`, `executing`, then `succeeded`, or `rejected`, `failed`, `expired`, `cancelled` — is recorded as `command.status_changed` facts, which are ordinary HOS events. A command is refused unless a current capability declaration, an authoritative source, a valid policy and, when the policy requires it, a valid approval all say it may run. A command is never confirmed by the system that sent it: it succeeds only when a fact of the authoritative system shows the expected effect.

## Contents

- `schemas/definitions.schema.json` — what HOS Commands 0.2 adds to Core 0.1: command types, the lifecycle, the reason codes, the references a command, an approval and a policy share, and the kinds of precondition.
- `schemas/event-envelope.schema.json` — the HOS Events envelope profile for the event types 0.2 adds: `hosschemaversion` is `0.2`, and `command:` is a subject.
- `schemas/events.schema.json` — three event types, on that envelope: `command.status_changed`, `housekeeping.task.reprioritized` and `guest.message.sent`. The fifteen types of HOS Events 0.1 keep their 0.1 schema and `hosschemaversion` `0.1`: a 0.1 event is the same bytes in a 0.1 and in a 0.2 stream.
- `schemas/command-envelope.schema.json` and `schemas/command.schema.json` — the command and its three types in the first series: `stay.unit_assign`, `housekeeping.task.reprioritize` and `guest.message.send`. No command checks a guest in or out, takes a payment or grants a financial compensation.
- `schemas/approval.schema.json` — a person's decision on a command, with the role they decided under, an expiry and the digest of the command they saw.
- `schemas/policy.schema.json` — the minimal policy 0.2 requires: an allow list in which anything not permitted is refused. A portable policy language, bounded autonomy and signed approvals are Trust 0.3.
- `schemas/producer-manifest.schema.json` — the HOS 0.1 Event Producer manifest, with `commands`: the command types a system executes as the authority, the facts that confirm each of them and how a confirming fact is tied to a command.
- `examples/` — one valid document of each kind. The digest in `approval.json` is the digest of `commands/stay.unit_assign.json`.
- `conformance/invalid/` — documents and streams a validator must reject, one case per file, and `conformance/valid/` — cases it must accept. A case has the form of those of HOS 0.1, with the producers' `manifests` for a stream. The `rule` of a case is one of the rules of HOS Commands 0.2: `commands/default-deny`, `commands/envelope`, `commands/target`, `commands/tenant-scope`, `commands/idempotency`, `commands/expiry`, `commands/preconditions`, `commands/minimal-data`, `commands/approval`, `commands/lifecycle`, `commands/no-compensation`, `commands/source-confirmation` and `commands/declared-capability`, or a rule of HOS Core 0.1 and HOS Events 0.1 that a document of 0.2 breaks as well. Rules are named after the principles of the specification until it numbers them.

The schemas reference each other by `$id` (`urn:hos:schema:0.2:*`) and reference Core 0.1 by `urn:hos:schema:0.1:core`; load the 0.1 and the 0.2 schemas together into your validator.

## Rules the schemas hold

- **Default deny.** Only the three command types exist, and a policy permits what it names: no permission, no command.
- **Protected effects.** A `stay.unit_assign` command concerns a stay that has not started (`expected`), protects the current assignment (`unit_assignment`) and holds no `from`, `to` or lock. Every command is evaluated on facts that are fresh enough (`facts_fresh`).
- **Minimal data.** A command carries what its handler needs: no name, no contact detail, no free text. A message names a template of the messaging system, with bounded parameters, and HOS keeps the identifier, never the content.
- **A lifecycle with places.** `command.status_changed` can only move between the statuses the lifecycle links; `rejected`, `failed`, `expired` and `cancelled` say why, with the reasons that fit them, and `approved` names the approval.
- **A person approves.** An approver is `user:`, with a role of the tenant; an integration proposes and never approves.

Some rules cannot be written in a JSON Schema and belong to the validator: the target equals the stay or task of `data`, the digest of an approval is the digest of its command, a confirming event is declared authoritative in the manifest, and the lifecycle a journal of commands records.

## Compatibility

HOS 0.1 is unchanged: every file under `public/spec/0.1` is valid and tested as before. HOS 0.2 adds files next to them.
