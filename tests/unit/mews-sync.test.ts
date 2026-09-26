import { checkProducer } from "@hos-ai/sdk";
import { describe, expect, it } from "vitest";

import type { MappingRecording } from "@/lib/hos/mappings/common";
import type { MewsReservation, MewsResource, MewsResourceBlock } from "@/lib/hos/mappings/mews";
import { accommodationServices, type MewsResourceCategory, type MewsService, type MewsSnapshot, syncMews } from "@/lib/hos/mappings/mews-sync";
import { loadRecording } from "@/lib/hos/mappings/replay";

const recording: MappingRecording = loadRecording("mews");
const fetched = (delivery: number) => recording.deliveries[delivery].fetched[0].response as { Reservations?: MewsReservation[]; Resources?: MewsResource[] };
const [property] = recording.adapter.properties as Array<{ enterpriseId: string; timezone: string; accommodationServiceIds: string[] }>;

describe("Mews live synchronisation", () => {
  const assigned = fetched(1).Reservations![0];
  const room = fetched(2).Resources![0];
  const bed: MewsResource = { ...room, Id: "3c1f0a52-6d2b-4b8e-9a51-0e2d7c4f8b10", ParentResourceId: room.Id, Name: "204-A" };
  const parking: MewsReservation = { ...assigned, Id: "b2d4e6f8-0a1c-4e3a-8b5d-7f9e1a3c5b7d", ServiceId: "5a7c9e1b-3d5f-4a2c-8e6b-0d2f4a6c8e0a" };
  const block: MewsResourceBlock = { Id: "7f8e9d0c-1b2a-3c4d-5e6f-7a8b9c0d1e2f", EnterpriseId: property.enterpriseId, AssignedResourceId: room.Id, IsActive: true, Type: "OutOfOrder", StartUtc: "2026-07-30T08:00:00Z", EndUtc: "2026-07-30T16:00:00Z", CreatedUtc: "2026-07-28T09:00:00Z", UpdatedUtc: "2026-07-28T09:00:00Z" };
  const snapshot = (resourceBlocks: MewsResourceBlock[]): MewsSnapshot => ({
    fetchedAt: "2026-07-30T08:30:00Z",
    enterprise: { id: property.enterpriseId, timezone: property.timezone },
    accommodationServiceIds: property.accommodationServiceIds,
    reservations: [assigned, parking],
    resources: [room, bed],
    resourceBlocks,
  });
  const options = { source: "urn:hos:pms:mews-live", tenant: "tenant_mews_live", propertyId: "prop_mews_live" };

  it("maps a fetched enterprise to valid facts, once", () => {
    const report = syncMews(snapshot([block]), options);
    expect(report.schema_errors).toEqual([]);
    expect(report.failures).toEqual([]);
    expect(report.resync_events).toBe(0);
    // A restarted adapter publishes the same facts again, with the same ids, and the producer check passes.
    expect(report.redelivery).toEqual(report.events);
    const lines = (facts: typeof report.events) => facts.map((fact) => JSON.stringify(fact)).join("\n");
    expect(checkProducer({ manifest: report.manifest, recording: lines(report.events), redelivery: lines(report.redelivery) })).toMatchObject({ valid: true, redelivery: { repeated: report.events.length } });
    expect(report.events_by_type).toEqual({ "reservation.created": 1, "stay.expected": 1, "stay.unit_assigned": 1, "unit.status_changed": 2, "unit.maintenance_scheduled": 1 });
    expect(report.unmapped).toEqual([{ event: "ServiceOrderUpdated", reason: "Not an accommodation service at this property.", count: 1 }]);
    expect(report.dispositions).toEqual({ applied: 6 });
    // HOS ids are minted, never the Mews GUIDs; only the room name comes back for people to read.
    expect(JSON.stringify(report.arrivals)).not.toContain(room.Id);
  });

  it("reports today's arrivals, with a maintenance window as a risk", () => {
    const blocked = syncMews(snapshot([block]), options);
    expect(blocked.arrivals.business_date).toBe("2026-07-30");
    expect(blocked.arrivals.stays).toEqual([expect.objectContaining({ unit: "204", housekeeping: "clean", readiness: "not_ready", situation: "at_risk", maintenance: { starts_at: block.StartUtc, ends_at: block.EndUtc } })]);
    expect(blocked.situations).toEqual({ "arrival.room_readiness_at_risk": 1 });

    const clear = syncMews(snapshot([]), options);
    expect(clear.arrivals.stays).toEqual([expect.objectContaining({ unit: "204", readiness: "ready", situation: "none", maintenance: null })]);
    expect(clear.situations).toEqual({});
  });

  it("makes a bed a unit, since Mews assigns a dorm stay to the bed", () => {
    // The Mews demo enterprises assign dorm stays to beds, the child resources of their rooms.
    const dorm: MewsReservation = { ...assigned, Id: "e4a6c8d0-2f4b-4d6e-8a0c-1b3d5f7a9c2e", Number: "5712", AssignedResourceId: bed.Id };
    const report = syncMews({ ...snapshot([]), reservations: [dorm] }, options);
    expect(report.unmapped).toEqual([]);
    expect(report.arrivals.stays).toEqual([expect.objectContaining({ unit: "204-A", housekeeping: room.State.toLowerCase(), readiness: "ready" })]);
  });

  it("takes as accommodation the bookable services with a place to stay, whatever their time unit", () => {
    // The shapes the Mews demo enterprise returned: parking and full-day meeting rooms are sold by the day, long stays by the month.
    const service = (Id: string, TimeUnitPeriod: string, IsActive = true): MewsService => ({ Id, IsActive, Data: { Discriminator: "Bookable", Value: { TimeUnitPeriod } } });
    const category = (ServiceId: string, Type: string, IsActive = true): MewsResourceCategory => ({ Id: `${ServiceId}-${Type}`, ServiceId, IsActive, Type });
    const services = [
      service("stay", "Day"),
      service("long-stay", "Month"),
      service("hostel", "Day"),
      service("parking", "Day"),
      service("meeting", "Day"),
      service("membership", "Day"),
      service("tours", "Hour"),
      service("closed", "Day", false),
      { Id: "breakfast", IsActive: true, Data: { Discriminator: "Additional" } },
    ];
    const categories = [
      category("stay", "Room"),
      category("stay", "Suite"),
      category("long-stay", "Apartment"),
      category("hostel", "Dorm"),
      category("hostel", "Bed"),
      category("parking", "ParkingSpot"),
      category("parking", "Room", false),
      category("meeting", "MeetingRoom"),
      category("tours", "Site"),
      category("closed", "Room"),
    ];
    expect(accommodationServices(services, categories)).toEqual(["stay", "long-stay", "hostel"]);
  });

  it("skips a resource state the mapping does not know instead of failing", () => {
    const report = syncMews({ ...snapshot([]), resources: [{ ...room, State: "Refurbishing" as MewsResource["State"] }] }, options);
    expect(report.failures).toEqual([]);
    expect(report.unmapped).toContainEqual({ event: "ResourceUpdated", reason: "Resource state Refurbishing has no HOS counterpart in this mapping.", count: 1 });
  });
});
