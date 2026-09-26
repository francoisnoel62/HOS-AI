import { checkProducer } from "@hos-ai/sdk";
import { describe, expect, it } from "vitest";

import type { CloudbedsReservation, CloudbedsRoomBlock, CloudbedsRoomStatus } from "@/lib/hos/mappings/cloudbeds";
import { type CloudbedsSnapshot, syncCloudbeds } from "@/lib/hos/mappings/cloudbeds-sync";
import type { MappingRecording } from "@/lib/hos/mappings/common";
import { loadRecording } from "@/lib/hos/mappings/replay";

const recording: MappingRecording = loadRecording("cloudbeds");
const fetched = <T>(delivery: number) => (recording.deliveries[delivery].fetched[0].response as { data: T }).data;
const [property] = recording.adapter.properties as Array<{ cloudbedsPropertyId: string; timezone: string; checkInTime: string; checkOutTime: string }>;

describe("Cloudbeds live synchronisation", () => {
  const assigned = fetched<CloudbedsReservation>(1);
  const [room] = fetched<CloudbedsRoomStatus[]>(2);
  const cancelled: CloudbedsReservation = { ...fetched<CloudbedsReservation>(0), reservationID: "5830021043", status: "canceled" };
  const block: CloudbedsRoomBlock = { roomBlockID: "RB-311", roomBlockType: "out_of_service", roomBlockReason: "Leaking shower", startDate: "2026-07-30", endDate: "2026-07-30", rooms: [{ eventID: "EV-1", roomID: room.roomID! }] };
  const hold: CloudbedsRoomBlock = { ...block, roomBlockID: "RB-312", roomBlockType: "courtesy_hold", rooms: [{ eventID: "EV-2", roomID: "418204-15" }] };
  const snapshot = (roomBlocks: CloudbedsRoomBlock[]): CloudbedsSnapshot => ({
    fetchedAt: "2026-07-30T08:30:00Z",
    property: { id: property.cloudbedsPropertyId, timezone: property.timezone, checkInTime: property.checkInTime, checkOutTime: property.checkOutTime },
    reservations: [assigned, cancelled],
    rooms: [room],
    roomBlocks,
  });
  const options = { source: "urn:hos:pms:cloudbeds-live", tenant: "tenant_cloudbeds_live", propertyId: "prop_cloudbeds_live" };

  it("maps a fetched property to valid facts, once", () => {
    const report = syncCloudbeds(snapshot([block, hold]), options);
    expect(report.schema_errors).toEqual([]);
    expect(report.failures).toEqual([]);
    expect(report.resync_events).toBe(0);
    // A restarted adapter publishes the same facts again, with the same ids, and the producer check passes.
    expect(report.redelivery).toEqual(report.events);
    const lines = (facts: typeof report.events) => facts.map((fact) => JSON.stringify(fact)).join("\n");
    expect(checkProducer({ manifest: report.manifest, recording: lines(report.events), redelivery: lines(report.redelivery) })).toMatchObject({ valid: true, redelivery: { repeated: report.events.length } });
    expect(report.events_by_type).toEqual({ "reservation.created": 1, "stay.expected": 1, "stay.unit_assigned": 1, "unit.status_changed": 2, "unit.maintenance_scheduled": 1 });
    expect(report.unmapped).toEqual(
      expect.arrayContaining([
        { event: "roomblock/live-check", reason: "A courtesy hold is a commercial hold, not maintenance.", count: 1 },
        { event: "reservation/live-check", reason: "Closed before HOS knew the reservation.", count: 1 },
      ]),
    );
    expect(report.dispositions).toEqual({ applied: 6 });
    // Each block's days next to the window read from them: endDate is the last blocked night.
    expect(report.room_blocks).toEqual([
      { type: "out_of_service", start_date: "2026-07-30", end_date: "2026-07-30", rooms: [{ room: "204", starts_at: "2026-07-30T13:00:00Z", ends_at: "2026-07-31T09:00:00Z" }] },
      { type: "courtesy_hold", start_date: "2026-07-30", end_date: "2026-07-30", rooms: [{ room: null, starts_at: null, ends_at: null }] },
    ]);
    // A fetch does not say when the reservation was made or the room assigned: the facts are dated when recorded.
    for (const type of ["reservation.created", "stay.unit_assigned"]) expect(report.events.find((event) => event.type === type)).toMatchObject({ time: "2026-07-30T08:30:00Z", hostimebasis: "recorded" });
    // HOS ids are minted, never the Cloudbeds ids; only the room name comes back for people to read.
    expect(JSON.stringify(report.arrivals)).not.toContain(room.roomID);
  });

  it("reports today's arrivals, with a room block as a risk", () => {
    const blocked = syncCloudbeds(snapshot([block]), options);
    expect(blocked.arrivals.business_date).toBe("2026-07-30");
    expect(blocked.arrivals.stays).toEqual([
      expect.objectContaining({ unit: "204", planned_arrival_at: "2026-07-30T13:00:00Z", housekeeping: "clean", readiness: "not_ready", situation: "at_risk", maintenance: { starts_at: "2026-07-30T13:00:00Z", ends_at: "2026-07-31T09:00:00Z" } }),
    ]);
    expect(blocked.situations).toEqual({ "arrival.room_readiness_at_risk": 1 });

    const clear = syncCloudbeds(snapshot([]), options);
    expect(clear.arrivals.stays).toEqual([expect.objectContaining({ unit: "204", readiness: "ready", situation: "none", maintenance: null })]);
    expect(clear.situations).toEqual({});
  });

  it("isolates a reservation the adapter cannot read", () => {
    const broken: CloudbedsReservation = { ...assigned, reservationID: "5830021044", startDate: "not a date", assigned: [{ ...assigned.assigned![0], subReservationID: "5830021044-1", startDate: "not a date" }] };
    const report = syncCloudbeds({ ...snapshot([]), reservations: [broken, assigned] }, options);
    expect(report.failures).toEqual([{ event: "reservation/live-check", id: "5830021044", error: expect.any(String) }]);
    expect(report.events_by_type["stay.unit_assigned"]).toBe(1);
  });
});
