import { describe, expect, it } from "vitest";

import { authority, byOccurrence, factKey, type HosFact, isLater, statusChanges, type UnitStatusChanged } from "../src/index.ts";
import { loadArrivalScenario } from "./spec.ts";

// The processing rules on their own, outside any projection.

const { manifests, events } = loadArrivalScenario();
const dirty = events[3] as UnitStatusChanged;
const snapshot = events.find((event) => event.hosdatamode === "snapshot") as UnitStatusChanged;
const reservation = events[0];

describe("deduplication", () => {
  it("identifies a fact by source and id together", () => {
    expect(factKey(dirty)).toBe(factKey({ ...dirty }));
    expect(factKey({ source: "urn:a", id: "b" })).not.toBe(factKey({ source: "urn:a:b", id: "" }));
  });
});

describe("occurrence order", () => {
  const at = (time: string, source: string, id: string) => ({ time, source, id });

  it("orders by time, then source, then id", () => {
    expect(isLater(at("2026-07-30T10:00:00Z", "urn:a", "1"), at("2026-07-30T09:00:00Z", "urn:b", "2"))).toBe(true);
    expect(isLater(at("2026-07-30T10:00:00+02:00", "urn:b", "1"), at("2026-07-30T09:00:00Z", "urn:a", "2"))).toBe(false);
    expect(isLater(at("2026-07-30T10:00:00Z", "urn:b", "1"), at("2026-07-30T10:00:00Z", "urn:a", "2"))).toBe(true);
    expect(isLater(at("2026-07-30T10:00:00Z", "urn:a", "2"), at("2026-07-30T10:00:00Z", "urn:a", "1"))).toBe(true);
    expect(isLater(at("2026-07-30T10:00:00Z", "urn:a", "1"), undefined)).toBe(true);
  });

  it("sorts facts whatever the delivery order", () => {
    expect([...events].reverse().sort(byOccurrence)).toEqual([...events].sort(byOccurrence));
    expect(byOccurrence(dirty, dirty)).toBe(0);
  });
});

describe("declared capability and authority", () => {
  it("applies a fact from the declared authority and observes one from another declared producer", () => {
    expect(authority(manifests, reservation)).toBe("authoritative");
    expect(authority(manifests, dirty, "housekeeping")).toBe("authoritative");
    expect(authority(manifests, snapshot, "occupancy")).toBe("non_authoritative");
  });

  it("denies what a manifest does not declare", () => {
    expect(authority(manifests, { ...reservation, source: "urn:hos:pms:unknown" } as HosFact)).toBe("undeclared_capability");
    expect(authority(manifests, { ...reservation, hosproperty: "prop_other" } as HosFact)).toBe("undeclared_capability");
    expect(authority(manifests, dirty, "commercial")).toBe("undeclared_capability");
  });

  it("denies a snapshot from a producer that does not declare snapshots", () => {
    expect(authority(manifests, { ...dirty, source: "urn:hos:pms:demo" } as HosFact, "housekeeping")).toBe("non_authoritative");
    expect(authority(manifests, { ...snapshot, source: "urn:hos:pms:demo" } as HosFact, "housekeeping")).toBe("undeclared_capability");
  });

  it("reads one dimension from a delta and every dimension from a snapshot", () => {
    expect(statusChanges(dirty)).toEqual([["housekeeping", "dirty"]]);
    expect(statusChanges(snapshot).map(([dimension]) => dimension)).toEqual(Object.keys((snapshot.data as { statuses: object }).statuses));
  });
});
