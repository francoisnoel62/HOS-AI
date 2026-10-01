// @vitest-environment node
import { createIdentityRegistry, type HosFact, validateEvent } from "@hos-ai/sdk";
import { describe, expect, it } from "vitest";

import type { ApaleoMaintenance, ApaleoReservation, ApaleoUnit } from "@/lib/hos/mappings/apaleo";
import { type ApaleoClient, createApaleoClient } from "@/lib/hos/mappings/apaleo-client";
import { loadRecording } from "@/lib/hos/mappings/replay";
import { apaleoPoll, type ApaleoPollState, apaleoReadScopes, apaleoScopesBeyondReading } from "@/lib/hos/producer/apaleo-poll";

const recording = loadRecording("apaleo");
const [property] = recording.adapter.properties as Array<{ apaleoPropertyId: string; propertyId: string; timezone: string; inspections: boolean }>;
const fetched = <T>(delivery: number) => recording.deliveries[delivery].fetched[0].response as T;
const assigned = fetched<ApaleoReservation>(1);
const room = fetched<ApaleoUnit>(2);
const unitGroups = [{ id: "HOSX-PAR-DBL", type: "BedRoom" }];
const maintenance: ApaleoMaintenance = {
  id: "HOSX-PAR-MNT1",
  unit: { id: room.id, name: "204" },
  from: "2026-07-30T12:00:00+02:00",
  to: "2026-07-30T18:00:00+02:00",
  type: "OutOfOrder",
};

type Source = {
  reservations?: ApaleoReservation[];
  modifiedReservations?: ApaleoReservation[];
  maintenances?: ApaleoMaintenance[];
  // What Apaleo answers for a maintenance fetched by id: absent ones are unknown, as deleted ones are.
  byId?: Record<string, ApaleoMaintenance>;
  // The scopes of the app's token: the read scopes the poll needs, unless given.
  scopes?: string[];
};

// An Apaleo property that answers what source holds, and records every request.
function fakeApaleo(source: Source) {
  const requests: Array<{ path: string; query: Record<string, string> }> = [];
  const client: ApaleoClient = {
    async get() {
      throw new Error("The poll reads lists and entities only.");
    },
    async find<T>(path: string) {
      requests.push({ path, query: {} });
      if (path === `/inventory/v1/properties/${property.apaleoPropertyId}`)
        return { id: property.apaleoPropertyId, timeZone: property.timezone } as T;
      return (source.byId?.[path.split("/").at(-1)!] ?? null) as T | null;
    },
    async list<T>(path: string, _key: string, query: Record<string, string>) {
      requests.push({ path, query });
      const answers: Record<string, unknown[]> = {
        "/inventory/v1/unit-groups": unitGroups,
        "/inventory/v1/units": [room],
        "/operations/v1/maintenances": source.maintenances ?? [],
        "/booking/v1/reservations": (query.dateFilter === "Modification" ? source.modifiedReservations : source.reservations) ?? [],
      };
      return answers[path] as T[];
    },
    async scopes() {
      return source.scopes ?? apaleoReadScopes;
    },
  };
  return { client, requests };
}

const options = {
  source: recording.adapter.source,
  tenant: "tenant_pilot",
  propertyId: property.propertyId,
  apaleoPropertyId: property.apaleoPropertyId,
  inspections: property.inspections,
  days: 2,
};
const identities = createIdentityRegistry(recording.adapter.crosswalk);
const types = (events: HosFact[]) => events.map((event) => event.type);
const lookups = (requests: ReturnType<typeof fakeApaleo>["requests"]) =>
  requests.filter(({ path }) => path.startsWith("/operations/v1/maintenances/")).map(({ path }) => path);

async function poll(source: Source, now: Date, state?: ApaleoPollState) {
  const apaleo = fakeApaleo(source);
  const result = await apaleoPoll(apaleo.client, options)({ state, identities, now });
  for (const event of result.events) expect(validateEvent(event), JSON.stringify(validateEvent.errors)).toBe(true);
  return { ...result, requests: apaleo.requests };
}

describe("Apaleo polling", () => {
  const first = new Date("2026-07-30T08:30:00Z");
  const second = new Date("2026-07-30T08:32:00Z");

  it("reads the window at the first poll, then the changes since the previous poll too", async () => {
    const one = await poll({ reservations: [assigned], maintenances: [maintenance] }, first);
    expect(types(one.events)).toContain("unit.maintenance_scheduled");
    expect(types(one.events)).toContain("stay.unit_assigned");
    // From yesterday to the window's last day, and no changes to read yet.
    const reservations = one.requests.filter(({ path }) => path === "/booking/v1/reservations").map(({ query }) => query);
    expect(reservations).toEqual([
      {
        propertyIds: property.apaleoPropertyId,
        unitGroupTypes: "BedRoom",
        dateFilter: "Stay",
        from: "2026-07-29T08:30:00Z",
        to: "2026-08-02T08:30:00Z",
      },
    ]);

    // The reservation moved a month on, out of the window, and the maintenance was deleted: Apaleo no longer knows it.
    const moved = {
      ...assigned,
      arrival: "2026-08-29T15:00:00+02:00",
      departure: "2026-08-31T11:00:00+02:00",
      modified: "2026-07-30T10:31:00+02:00",
    };
    const two = await poll({ modifiedReservations: [moved] }, second, one.state);
    expect(types(two.events)).toEqual(["unit.maintenance_cancelled", "reservation.updated", "stay.expected"]);
    // The changes are read from five minutes before the previous poll.
    expect(two.requests.filter(({ query }) => query.dateFilter === "Modification").map(({ query }) => [query.from, query.to])).toEqual([
      ["2026-07-30T08:25:00Z", "2026-07-30T08:32:00Z"],
    ]);
    expect(lookups(two.requests)).toEqual(["/operations/v1/maintenances/HOSX-PAR-MNT1"]);

    // A cancelled maintenance is not looked up again, and nothing changed: nothing is published.
    const three = await poll({ modifiedReservations: [moved] }, new Date("2026-07-30T08:34:00Z"), two.state);
    expect(three.events).toEqual([]);
    expect(lookups(three.requests)).toEqual([]);
  });

  it("takes a maintenance moved out of the window for a change, not a deletion", async () => {
    const { state } = await poll({ maintenances: [maintenance] }, first);
    const moved = { ...maintenance, from: "2026-08-20T12:00:00+02:00", to: "2026-08-20T18:00:00+02:00" };
    const { events } = await poll({ byId: { [maintenance.id]: moved } }, second, state);
    expect(events.filter((event) => event.type.startsWith("unit.maintenance"))).toMatchObject([
      { type: "unit.maintenance_scheduled", data: { starts_at: "2026-08-20T10:00:00Z", ends_at: "2026-08-20T16:00:00Z" } },
    ]);
  });

  it("does not look up a published maintenance that has ended", async () => {
    const { state } = await poll({ maintenances: [maintenance] }, first);
    const { requests, events } = await poll({}, new Date("2026-08-01T08:30:00Z"), state);
    expect(lookups(requests)).toEqual([]);
    expect(types(events)).not.toContain("unit.maintenance_cancelled");
  });

  it("keeps the latest version of a reservation read in the window and among the changes", async () => {
    const { state } = await poll({ reservations: [assigned] }, first);
    const cancelled = {
      ...assigned,
      status: "Canceled" as const,
      cancellationTime: "2026-07-30T10:31:00+02:00",
      modified: "2026-07-30T10:31:00+02:00",
    };
    const { events } = await poll({ reservations: [assigned], modifiedReservations: [cancelled] }, second, state);
    expect(types(events)).toEqual(["reservation.cancelled"]);
  });

  it("fails the whole poll when the adapter cannot read an entity, and names it", async () => {
    const unreadable = { ...assigned, arrival: "not a time" };
    await expect(poll({ reservations: [unreadable] }, first)).rejects.toThrow(`Apaleo Reservation ${assigned.id}: `);
  });
});

describe("Apaleo client", () => {
  // Apaleo's identity server and API: tokens numbered as they are granted, and an API answering by path.
  function fakeServer(answer: (path: string, token: string) => Response) {
    const granted: string[] = [];
    const fetch = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === "/connect/token") {
        granted.push(`token-${granted.length + 1}`);
        return Response.json({ access_token: granted.at(-1), expires_in: 3600 });
      }
      return answer(url.pathname, granted.at(-1)!);
    }) as typeof globalThis.fetch;
    const client = (onTruncated: "warn" | "fail" = "fail") =>
      createApaleoClient({
        identity: "https://identity.test",
        api: "https://api.test",
        clientId: "id",
        clientSecret: "secret",
        maxPages: 2,
        onTruncated,
        fetch,
      });
    return { client, granted };
  }

  it("keeps a token for its lifetime, and asks for a new one when Apaleo refuses it", async () => {
    const server = fakeServer((path, token) =>
      token === "token-1" && path === "/refused" ? new Response("", { status: 401 }) : Response.json({ path, token }),
    );
    const apaleo = server.client();
    expect(await apaleo.get("/first")).toEqual({ path: "/first", token: "token-1" });
    expect(await apaleo.get("/second")).toEqual({ path: "/second", token: "token-1" });
    expect(await apaleo.get("/refused")).toEqual({ path: "/refused", token: "token-2" });
    expect(server.granted).toEqual(["token-1", "token-2"]);
  });

  it("reads 204 as no items and 404 as an unknown entity, and fails a list with more pages than allowed", async () => {
    const server = fakeServer((path) =>
      path === "/empty"
        ? new Response(null, { status: 204 })
        : path === "/gone"
          ? new Response("", { status: 404 })
          : Response.json({ items: Array.from({ length: 200 }, (_, index) => ({ index })), count: 10_000 }),
    );
    const apaleo = server.client();
    expect(await apaleo.get("/empty")).toBeNull();
    expect(await apaleo.find("/gone")).toBeNull();
    await expect(apaleo.get("/gone")).rejects.toThrow("GET /gone answered 404");
    await expect(apaleo.list("/many", "items", {})).rejects.toThrow("/many: more than 2 pages of 200.");
  });

  it("tells the scopes Apaleo granted, and refuses addresses without HTTPS", async () => {
    const fetch = (async () =>
      Response.json({
        access_token: "token",
        expires_in: 3600,
        scope: "reservations.read setup.read maintenances.manage",
      })) as typeof globalThis.fetch;
    const apaleo = createApaleoClient({ identity: "https://identity.test", api: "https://api.test", clientId: "id", clientSecret: "secret", fetch });
    expect(await apaleo.scopes()).toEqual(["reservations.read", "setup.read", "maintenances.manage"]);
    expect(() => createApaleoClient({ identity: "http://identity.test", api: "https://api.test", clientId: "id", clientSecret: "secret" })).toThrow(
      "Apaleo's addresses must use HTTPS",
    );
  });
});

describe("Apaleo session", () => {
  it("reads nothing when the app lacks a read scope the poll needs", async () => {
    const apaleo = fakeApaleo({ reservations: [assigned], scopes: ["reservations.read", "setup.read"] });
    await expect(apaleoPoll(apaleo.client, options)({ state: undefined, identities, now: new Date("2026-07-30T08:30:00Z") })).rejects.toThrow(
      "The Apaleo app lacks the scopes maintenances.read: give it setup.read, reservations.read, maintenances.read.",
    );
    expect(apaleo.requests).toEqual([]);
  });

  it("names the scopes beyond reading, which the pilot does not need", () => {
    expect(apaleoScopesBeyondReading(["reservations.read", "setup.read", "reservations.manage", "maintenances.read", "folios.manage"])).toEqual([
      "reservations.manage",
      "folios.manage",
    ]);
  });
});
