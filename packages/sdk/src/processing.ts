import type { HosFact, ProducerManifest, UnitStatusChanged, UnitStatusDimension } from "./types.generated.ts";

// The processing rules of HOS Events 0.1 that every consumer applies, whatever it builds on the facts: deduplication,
// occurrence order, declared capability and authority. They are normative; the arrival-readiness projection under
// @hos-ai/sdk/reference is one consumer built on them.

// What a consumer does with a delivered fact.
export type Disposition = "applied" | "duplicate" | "superseded" | "non_authoritative" | "undeclared_capability";

export type Occurrence = Pick<HosFact, "time" | "source" | "id">;

// source + id identify a fact: a second delivery of the same pair is a duplicate.
export function factKey(fact: Pick<HosFact, "source" | "id">) {
  return `${fact.source}\u0000${fact.id}`;
}

// The later occurrence wins. Equal times fall back to source, then id, so every implementation agrees.
export function isLater(candidate: Occurrence, current: Occurrence | undefined) {
  if (!current) return true;
  const delta = Date.parse(candidate.time) - Date.parse(current.time);
  if (delta !== 0) return delta > 0;
  if (candidate.source !== current.source) return candidate.source > current.source;
  return candidate.id > current.id;
}

export function byOccurrence(a: Occurrence, b: Occurrence) {
  if (isLater(a, b)) return 1;
  return isLater(b, a) ? -1 : 0;
}

// A producer may only emit what its manifest declares for the property; anything undeclared is denied.
export function findDeclaration(manifests: ProducerManifest[], event: HosFact, dimension?: UnitStatusDimension) {
  const manifest = manifests.find((candidate) => candidate.producer === event.source && candidate.property_ids.includes(event.hosproperty));
  return manifest?.events.find(
    (declared) => declared.type === event.type && (!dimension || !declared.dimensions || declared.dimensions.includes(dimension)),
  );
}

// A consumer applies a fact from the declared authority, keeps a fact from another declared producer as an observation,
// and ignores an undeclared one. A snapshot is declared only when the manifest allows snapshots of that type.
export function authority(
  manifests: ProducerManifest[],
  event: HosFact,
  dimension?: UnitStatusDimension,
): "authoritative" | "non_authoritative" | "undeclared_capability" {
  const declaration = findDeclaration(manifests, event, dimension);
  if (!declaration || (event.hosdatamode === "snapshot" && !declaration.snapshot)) return "undeclared_capability";
  return declaration.authoritative ? "authoritative" : "non_authoritative";
}

// The dimensions a unit.status_changed reports, with their values: one for a delta, every dimension of a snapshot.
export function statusChanges(event: UnitStatusChanged): Array<[UnitStatusDimension, string]> {
  const data = event.data;
  if ("statuses" in data) return Object.entries(data.statuses) as Array<[UnitStatusDimension, string]>;
  return [[data.dimension, data.current]];
}
