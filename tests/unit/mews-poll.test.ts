// @vitest-environment node
import { createIdentityRegistry, type HosFact, validateEvent } from "@hos-ai/sdk";
import { describe, expect, it } from "vitest";

import type { MewsReservation, MewsResource, MewsResourceBlock } from "@/lib/hos/mappings/mews";
import { createMewsClient, type MewsClient } from "@/lib/hos/mappings/mews-client";
import { loadRecording } from "@/lib/hos/mappings/replay";
import { mewsPoll, type MewsPollState } from "@/lib/hos/producer/mews-poll";

const recording = loadRecording("mews");
const [property] = recording.adapter.properties as Array<{
  enterpriseId: string;
  propertyId: string;
  timezone: string;
  accommodationServiceIds: string[];
}>;
const fetched = (delivery: number) =>
  recording.deliveries[delivery].fetched[0].response as { Reservations?: MewsReservation[]; Resources?: MewsResource[] };
const assigned = fetched(1).Reservations![0];
const room = fetched(2).Resources![0];
const block: MewsResourceBlock = {
  Id: "7f8e9d0c-1b2a-3c4d-5e6f-7a8b9c0d1e2f",
  EnterpriseId: property.enterpriseId,
  AssignedResourceId: room.Id,
  IsActive: true,
  Type: "OutOfOrder",
  StartUtc: "2026-07-30T08:00:00Z",
  EndUtc: "2026-07-30T16:00:00Z",
  CreatedUtc: "2026-07-28T09:00:00Z",
  UpdatedUtc: "2026-07-28T09:00:00Z",
};

type Source = {
  reservations?: MewsReservation[];
  updatedReservations?: MewsReservation[];
  blocks?: MewsResourceBlock[];
  updatedBlocks?: MewsResourceBlock[];
};

// A Mews enterprise that answers what source holds, and records every request.
function fakeMews(source: Source) {
  const requests: Array<{ operation: string; body: Record<string, unknown> }> = [];
  const client: MewsClient = {
    async call<T>(operation: string, body: Record<string, unknown> = {}) {
      requests.push({ operation, body });
      return { Enterprise: { Id: property.enterpriseId, TimeZoneIdentifier: property.timezone } } as T;
    },
    async getAll<T>(operation: string, _key: string, body: Record<string, unknown>) {
      requests.push({ operation, body });
      const updated = "UpdatedUtc" in body;
      const answers: Record<string, unknown[]> = {
        "services/getAll": [],
        "resources/getAll": [room],
        "reservations/getAll/2023-06-06": (updated ? source.updatedReservations : source.reservations) ?? [],
        "resourceBlocks/getAll": (updated ? source.updatedBlocks : source.blocks) ?? [],
      };
      return answers[operation] as T[];
    },
  };
  return { client, requests };
}

const options = {
  source: recording.adapter.source,
  tenant: "tenant_pilot",
  propertyId: property.propertyId,
  days: 2,
  serviceIds: property.accommodationServiceIds,
};
const identities = createIdentityRegistry(recording.adapter.crosswalk);
const types = (events: HosFact[]) => events.map((event) => event.type);
const filters = (requests: ReturnType<typeof fakeMews>["requests"], operation: string) =>
  requests.filter((request) => request.operation === operation).map(({ body }) => ({ CollidingUtc: body.CollidingUtc, UpdatedUtc: body.UpdatedUtc }));

async function poll(source: Source, now: Date, state?: MewsPollState) {
  const mews = fakeMews(source);
  const result = await mewsPoll(mews.client, options)({ state, identities, now });
  for (const event of result.events) expect(validateEvent(event), JSON.stringify(validateEvent.errors)).toBe(true);
  return { ...result, requests: mews.requests };
}

describe("Mews polling", () => {
  const first = new Date("2026-07-30T08:30:00Z");
  const second = new Date("2026-07-30T08:32:00Z");

  it("reads the window at the first poll, then the changes since the previous poll too", async () => {
    const one = await poll({ reservations: [assigned], blocks: [block] }, first);
    expect(types(one.events)).toEqual([
      "unit.status_changed",
      "unit.maintenance_scheduled",
      "reservation.created",
      "stay.expected",
      "stay.unit_assigned",
    ]);
    // From yesterday to the window's last day, and no changes to read yet.
    const window = { CollidingUtc: { StartUtc: "2026-07-29T08:30:00.000Z", EndUtc: "2026-08-02T08:30:00.000Z" }, UpdatedUtc: undefined };
    expect(filters(one.requests, "reservations/getAll/2023-06-06")).toEqual([window]);
    expect(filters(one.requests, "resourceBlocks/getAll")).toEqual([window]);
    // Deleted blocks too, so a deleted block is read as such rather than missing.
    expect(one.requests.filter(({ operation }) => operation === "resourceBlocks/getAll").map(({ body }) => body.ActivityStates)).toEqual([
      ["Active", "Deleted"],
    ]);
    expect(one.state.polledAt).toBe(first.toISOString());

    // The reservation moved a month on, out of the window, and the block was deleted: only the changes since say so.
    const moved = {
      ...assigned,
      ScheduledStartUtc: "2026-08-29T13:00:00Z",
      ScheduledEndUtc: "2026-08-31T09:00:00Z",
      UpdatedUtc: "2026-07-30T08:31:00Z",
    };
    const deleted = { ...block, IsActive: false, DeletedUtc: "2026-07-30T08:31:30Z", UpdatedUtc: "2026-07-30T08:31:30Z" };
    const two = await poll({ updatedReservations: [moved], updatedBlocks: [deleted] }, second, one.state);
    expect(types(two.events)).toEqual(["unit.maintenance_cancelled", "reservation.updated", "stay.expected"]);
    // The changes are read from five minutes before the previous poll.
    const since = { StartUtc: "2026-07-30T08:25:00.000Z", EndUtc: "2026-07-30T08:32:00.000Z" };
    expect(filters(two.requests, "reservations/getAll/2023-06-06").map((filter) => filter.UpdatedUtc)).toEqual([undefined, since]);
    expect(filters(two.requests, "resourceBlocks/getAll").map((filter) => filter.UpdatedUtc)).toEqual([undefined, since]);

    // Nothing changed since: nothing is published.
    expect((await poll({ updatedReservations: [moved] }, new Date("2026-07-30T08:34:00Z"), two.state)).events).toEqual([]);
  });

  it("keeps the latest version of an entity read in the window and among the changes", async () => {
    const { state } = await poll({ reservations: [assigned] }, first);
    const cancelled = { ...assigned, State: "Canceled" as const, CancelledUtc: "2026-07-30T08:31:00Z", UpdatedUtc: "2026-07-30T08:31:00Z" };
    const { events } = await poll({ reservations: [assigned], updatedReservations: [cancelled] }, second, state);
    expect(types(events)).toEqual(["reservation.cancelled"]);
  });

  it("reads changes as far back as Mews allows after a long stop", async () => {
    const { requests } = await poll({}, second, { polledAt: "2026-01-01T00:00:00Z" });
    expect(filters(requests, "reservations/getAll/2023-06-06")[1].UpdatedUtc).toEqual({
      StartUtc: new Date(second.getTime() - 90 * 86_400_000).toISOString(),
      EndUtc: second.toISOString(),
    });
  });

  it("fails the whole poll when the adapter cannot read an entity, and names it", async () => {
    const unreadable = { ...assigned, ScheduledStartUtc: "not a time" };
    await expect(poll({ reservations: [unreadable] }, first)).rejects.toThrow(`Mews ServiceOrderUpdated ${assigned.Id}: `);
  });
});

describe("Mews client", () => {
  // Mews answering full pages, each with a cursor to the next.
  const endless = (async () =>
    new Response(JSON.stringify({ Reservations: Array.from({ length: 1000 }, (_, index) => ({ Id: String(index) })), Cursor: "next" }), {
      status: 200,
    })) as typeof fetch;
  const client = (onTruncated: "warn" | "fail") =>
    createMewsClient({ platform: "https://mews.test", clientToken: "c", accessToken: "a", client: "test", maxPages: 2, onTruncated, fetch: endless });

  it("fails a Get all with more pages than allowed, rather than return part of it, when asked to", async () => {
    await expect(client("fail").getAll("reservations/getAll/2023-06-06", "Reservations", {})).rejects.toThrow(
      "reservations/getAll/2023-06-06: more than 2 pages of 1000.",
    );
  });
});
