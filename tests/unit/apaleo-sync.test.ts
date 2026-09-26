import { checkProducer } from "@hos-ai/sdk";
import { describe, expect, it } from "vitest";

import type { ApaleoMaintenance, ApaleoReservation, ApaleoUnit } from "@/lib/hos/mappings/apaleo";
import { type ApaleoSnapshot, syncApaleo } from "@/lib/hos/mappings/apaleo-sync";
import type { MappingRecording } from "@/lib/hos/mappings/common";
import { loadRecording } from "@/lib/hos/mappings/replay";

const recording: MappingRecording = loadRecording("apaleo");
const fetched = <T>(delivery: number) => recording.deliveries[delivery].fetched[0].response as T;
const [property] = recording.adapter.properties as Array<{ apaleoPropertyId: string; timezone: string; inspections: boolean }>;

describe("Apaleo live synchronisation", () => {
  const assigned = fetched<ApaleoReservation>(1);
  const room = fetched<ApaleoUnit>(2);
  // Embedded unit groups may omit their type: the unit group list says what they are.
  const parking: ApaleoUnit = { ...room, id: "HOSX-PAR-P01", name: "P01", unitGroup: { id: "HOSX-PAR-PARK" } };
  const cancelled: ApaleoReservation = {
    ...assigned,
    id: "HOSXKQPT-2",
    status: "Canceled",
    cancellationTime: "2026-07-20T10:00:00+02:00",
    unit: undefined,
  };
  const maintenance: ApaleoMaintenance = {
    id: "HOSX-PAR-MNT1",
    unit: { id: room.id, name: "204" },
    from: "2026-07-30T12:00:00+02:00",
    to: "2026-07-30T18:00:00+02:00",
    type: "OutOfOrder",
  };
  const snapshot = (maintenances: ApaleoMaintenance[]): ApaleoSnapshot => ({
    fetchedAt: "2026-07-30T08:30:00Z",
    property: { id: property.apaleoPropertyId, timezone: property.timezone, inspections: property.inspections },
    unitGroups: [
      { id: "HOSX-PAR-DBL", type: "BedRoom" },
      { id: "HOSX-PAR-PARK", type: "ParkingLot" },
    ],
    reservations: [assigned, cancelled],
    units: [room, parking],
    maintenances,
  });
  const options = { source: "urn:hos:pms:apaleo-live", tenant: "tenant_apaleo_live", propertyId: "prop_apaleo_live" };

  it("maps a fetched property to valid facts, once", () => {
    const report = syncApaleo(snapshot([maintenance]), options);
    expect(report.schema_errors).toEqual([]);
    expect(report.failures).toEqual([]);
    expect(report.resync_events).toBe(0);
    // A restarted adapter publishes the same facts again, with the same ids, and the producer check passes.
    expect(report.redelivery).toEqual(report.events);
    const lines = (facts: typeof report.events) => facts.map((fact) => JSON.stringify(fact)).join("\n");
    expect(checkProducer({ manifest: report.manifest, recording: lines(report.events), redelivery: lines(report.redelivery) })).toMatchObject({
      valid: true,
      redelivery: { repeated: report.events.length },
    });
    expect(report.events_by_type).toEqual({
      "reservation.created": 1,
      "stay.expected": 1,
      "stay.unit_assigned": 1,
      "unit.status_changed": 2,
      "unit.maintenance_scheduled": 1,
    });
    expect(report.unmapped).toEqual(
      expect.arrayContaining([
        { event: "unit/changed", reason: "Not a bedroom.", count: 1 },
        { event: "reservation/changed", reason: "Closed before HOS knew the reservation.", count: 1 },
      ]),
    );
    expect(report.dispositions).toEqual({ applied: 6 });
    // The fetch does not say when the unit was assigned: only that the reservation last changed then.
    expect(report.events.find((event) => event.type === "stay.unit_assigned")).toMatchObject({
      time: "2026-07-30T06:06:00Z",
      hostimebasis: "modified",
    });
    // HOS ids are minted, never the Apaleo ids; only the room name comes back for people to read.
    expect(JSON.stringify(report.arrivals)).not.toContain(room.id);
  });

  it("reports today's arrivals, with a maintenance window as a risk", () => {
    const blocked = syncApaleo(snapshot([maintenance]), options);
    expect(blocked.arrivals.business_date).toBe("2026-07-30");
    expect(blocked.arrivals.stays).toEqual([
      expect.objectContaining({
        unit: "204",
        housekeeping: "clean",
        readiness: "not_ready",
        situation: "at_risk",
        maintenance: { starts_at: "2026-07-30T10:00:00Z", ends_at: "2026-07-30T16:00:00Z" },
      }),
    ]);
    expect(blocked.situations).toEqual({ "arrival.room_readiness_at_risk": 1 });

    const clear = syncApaleo(snapshot([]), options);
    expect(clear.arrivals.stays).toEqual([expect.objectContaining({ unit: "204", readiness: "ready", situation: "none", maintenance: null })]);
    expect(clear.situations).toEqual({});
  });

  it("isolates a reservation the adapter cannot read", () => {
    const broken: ApaleoReservation = { ...assigned, id: "HOSXKQPT-3", arrival: "not a date" };
    const report = syncApaleo({ ...snapshot([]), reservations: [broken, assigned] }, options);
    expect(report.failures).toEqual([{ event: "reservation/changed", id: "HOSXKQPT-3", error: expect.any(String) }]);
    expect(report.events_by_type["reservation.created"]).toBe(1);
    expect(report.resync_events).toBe(0);
  });
});
