import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  Envelope,
  HosEventType,
  HosFact,
  HousekeepingStatus,
  ProducerManifest,
  ReservationCreated,
  ReservationCreatedData,
  UnitStatusChanged,
  UnitStatusChangedData,
  UnitStatusChangedSnapshotData,
} from "../src/index.ts";
import type { ArrivalRoomReadinessResolved, Situation } from "../src/reference/index.ts";
import { examples } from "./examples.generated.ts";
import { listExampleFiles, readJson } from "./spec.ts";

// The types generated from the schemas. The checks run in the SDK's typecheck: it fails when an assertion no longer
// holds, or when an expected type error disappears.

const reservation = examples["reservation.created.json"];

describe("types generated from the schemas", () => {
  it("type every published example", () => {
    expect(Object.keys(examples).sort()).toEqual(listExampleFiles());
    for (const [file, example] of Object.entries(examples)) expect(example).toEqual(readJson(`examples/${file}`));
  });

  it("give each event its envelope and its data", () => {
    expectTypeOf<ReservationCreated>().toEqualTypeOf<Envelope<"reservation.created", ReservationCreatedData>>();
    expectTypeOf<HosFact["type"]>().toEqualTypeOf<HosEventType>();
    expectTypeOf<Extract<HosFact, { type: "reservation.created" }>>().toEqualTypeOf<ReservationCreated>();
    expectTypeOf<ProducerManifest["events"][number]["type"]>().toEqualTypeOf<HosEventType>();
  });

  it("type a unit status change as a delta or a snapshot", () => {
    expectTypeOf<UnitStatusChanged["data"]>().toEqualTypeOf<UnitStatusChangedData | UnitStatusChangedSnapshotData>();
    expectTypeOf<UnitStatusChangedSnapshotData["statuses"]["housekeeping"]>().toEqualTypeOf<HousekeepingStatus | undefined>();
  });

  it("close the data objects the schemas close", () => {
    // @ts-expect-error personal data the Core does not define
    const withName: ReservationCreatedData = { ...reservation.data, guest_name: "Jane Example" };
    // @ts-expect-error a value outside the enum
    const cleaning: HousekeepingStatus = "cleaning";
    // @ts-expect-error subjects are a string, not an array
    const subjects: ReservationCreated["hossubjects"] = ["reservation:res_1042"];
    expect([withName, cleaning, subjects]).toHaveLength(3);
  });

  it("type the reference situations apart from the facts", () => {
    expectTypeOf<Situation["type"]>().toEqualTypeOf<"arrival.room_readiness_at_risk" | "arrival.room_readiness_resolved">();
    expectTypeOf<ArrivalRoomReadinessResolved["data"]["unit_id"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Situation>().not.toExtend<HosFact>();
  });
});
