import { describe, expect, it } from "vitest";

import { loadExpectedOutcome, toExpectedOutcome } from "@/lib/hos/conformance";
import type { RecordedCall } from "@/lib/hos/mappings/common";
import { buildArrivalStream, type PmsMapping, pmsMappings } from "@/lib/hos/mappings/replay";
import { replayArrivalReadiness } from "@/lib/hos/projection";
import type { HosFact } from "@/lib/hos/types";

import { errors, validateEvent } from "./hos-schemas";

// The payload shapes each recording must respect, taken from the sources it names: required properties for Mews and
// Apaleo, and for Cloudbeds, whose SDK marks every property optional, the documented properties the adapter reads.
const shapes: Record<PmsMapping, { webhook: string[]; entities: Record<string, { of: (response: never) => unknown[]; properties: string[] }> }> = {
  mews: {
    webhook: ["EnterpriseId", "IntegrationId", "Events"],
    entities: {
      "reservations/getAll/2023-06-06": {
        of: (response: { Reservations: unknown[] }) => response.Reservations,
        properties: ["Id", "ServiceId", "AccountId", "AccountType", "CreatorProfileId", "UpdaterProfileId", "Number", "State", "Origin", "CreatedUtc", "UpdatedUtc", "Options", "RateId", "GroupId", "RequestedResourceCategoryId", "AssignedResourceLocked", "ScheduledStartUtc", "ScheduledEndUtc", "PersonCounts"],
      },
      "resources/getAll": {
        of: (response: { Resources: unknown[] }) => response.Resources,
        properties: ["Id", "EnterpriseId", "IsActive", "Name", "State", "Descriptions", "CreatedUtc", "UpdatedUtc", "Data", "ExternalNames", "Directions"],
      },
    },
  },
  apaleo: {
    webhook: ["topic", "type", "id", "accountId", "propertyId", "timestamp", "data"],
    entities: {
      "GET /booking/v1/reservations/{id}": {
        of: (response: unknown) => [response],
        properties: ["id", "bookingId", "status", "property", "ratePlan", "unitGroup", "totalGrossAmount", "arrival", "departure", "created", "modified", "adults", "channelCode", "guaranteeType", "cancellationFee", "noShowFee", "balance", "taxDetails", "hasCityTax", "payableAmount", "isOpenForCharges"],
      },
      "GET /inventory/v1/units/{id}": {
        of: (response: unknown) => [response],
        properties: ["id", "name", "description", "property", "status", "maxPersons", "created"],
      },
    },
  },
  cloudbeds: {
    webhook: ["version", "event", "timestamp"],
    entities: {
      "GET /getReservation": {
        of: (response: { data: unknown }) => [response.data],
        properties: ["propertyID", "reservationID", "status", "startDate", "endDate", "guestList", "assigned", "unassigned"],
      },
      "GET /getHousekeepingStatus": {
        of: (response: { data: unknown[] }) => response.data,
        properties: ["date", "roomID", "roomCondition", "roomOccupied", "roomBlocked"],
      },
    },
  },
};

function omit(event: HosFact, fields: string[]) {
  const copy = structuredClone(event) as unknown as Record<string, Record<string, unknown>>;
  for (const field of ["id", "hosrecordedat", ...fields]) {
    const [head, tail] = field.split(".");
    if (tail) delete copy[head][tail];
    else delete copy[head];
  }
  return copy;
}

describe.each(pmsMappings)("%s mapping of the arrival scenario", (pms) => {
  const { scenario, manifests, corpus, recording, stream } = buildArrivalStream(pms);
  const mapped = stream.filter((fact) => fact.recorded);
  const shape = shapes[pms];

  it("names its sources, at least one of them the PMS's own", () => {
    expect(recording.sources.length).toBeGreaterThan(0);
    expect(recording.sources.some((source) => source.official)).toBe(true);
  });

  it("uses the documented webhook shape", () => {
    for (const { webhook } of recording.deliveries) expect(Object.keys(webhook as object)).toEqual(expect.arrayContaining(shape.webhook));
  });

  it("fetches entities with the documented properties", () => {
    const calls: RecordedCall[] = recording.deliveries.flatMap((item) => item.fetched);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const entity = shape.entities[call.operation];
      expect(entity, call.operation).toBeDefined();
      for (const item of entity.of(call.response as never)) expect(Object.keys(item as object)).toEqual(expect.arrayContaining(entity.properties));
    }
  });

  it("accounts for every PMS delivery of the corpus", () => {
    const pmsDeliveries = corpus.flatMap((event, index) => (event.source === recording.adapter.source ? [index + 1] : []));
    const covered = [...recording.deliveries.flatMap((item) => item.reproduces.filter((delivery) => delivery !== null)), ...recording.not_reproduced.map((item) => item.delivery)];
    expect(covered.sort((a, b) => a - b)).toEqual(pmsDeliveries);
  });

  it.each(mapped.map((fact) => [fact.recorded!.delivery, fact.event.type, fact.event] as const))("maps delivery %s to a valid %s", (_delivery, _type, event) => {
    expect(validateEvent(event), errors(validateEvent)).toBe(true);
  });

  it("maps each delivery to exactly the facts it reproduces or adds", () => {
    for (const delivery of recording.deliveries) {
      expect(mapped.filter((fact) => fact.recorded === delivery)).toHaveLength(delivery.reproduces.length);
      expect(recording.additions.filter((item) => item.delivery === delivery.delivery)).toHaveLength(delivery.reproduces.filter((corpusDelivery) => corpusDelivery === null).length);
    }
  });

  it("reproduces the corpus PMS facts, apart from the documented differences", () => {
    for (const { corpusDelivery, event } of mapped) {
      if (corpusDelivery === null) continue;
      const expected = corpus[corpusDelivery - 1];
      const fields = recording.differences.filter((item) => item.delivery === corpusDelivery).map((item) => item.field);
      expect(event.type).toBe(expected.type);
      expect(omit(event, fields)).toEqual(omit(expected, fields));
    }
  });

  it("reaches the published expected outcome of the scenario", () => {
    const steps = replayArrivalReadiness(
      stream.map((fact) => fact.event),
      manifests,
      scenario.projection,
    );

    // Facts the corpus does not have must land as documented and change nothing the outcome pins down.
    const added = steps.filter((_step, index) => stream[index].corpusDelivery === null);
    expect(added.map((step) => [step.event.type, step.disposition])).toEqual(recording.additions.map((item) => [item.type, item.disposition]));
    expect(added.flatMap((step) => step.emitted)).toEqual([]);

    const kept = steps.filter((_step, index) => stream[index].corpusDelivery !== null);
    const corpusDelivery = (delivery: number) => stream[delivery - 1].corpusDelivery!;
    const actual = toExpectedOutcome(kept, scenario);

    // The mapped facts carry the adapter's ids; everything else must match the corpus outcome exactly.
    const ids = new Map(mapped.filter((fact) => fact.corpusDelivery !== null).map((fact) => [corpus[fact.corpusDelivery! - 1].id, fact.event.id]));
    const skipped = new Set(recording.not_reproduced.map((item) => item.delivery));
    const published = JSON.parse(JSON.stringify(loadExpectedOutcome()), (_key, value) => (typeof value === "string" && ids.has(value) ? ids.get(value) : value)) as ReturnType<typeof loadExpectedOutcome>;
    // Evidence follows occurrence order, and facts that tie on time and source follow their ids: with the adapter's
    // times and ids, the order is recomputed by the same rule.
    const times = new Map(stream.map(({ event }) => [`${event.source} ${event.id}`, Date.parse(event.time)]));
    const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    for (const { event } of published.situations) event.data.evidence.sort((a, b) => times.get(`${a.source} ${a.id}`)! - times.get(`${b.source} ${b.id}`)! || compare(a.source, b.source) || compare(a.id, b.id));

    expect(actual.deliveries.map((item) => ({ ...item, delivery: corpusDelivery(item.delivery) }))).toEqual(published.deliveries.filter((item) => !skipped.has(item.delivery)));
    expect(actual.situations.map((item) => ({ ...item, delivery: corpusDelivery(item.delivery) }))).toEqual(published.situations);
  });
});
