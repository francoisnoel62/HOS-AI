import { createIdentityRegistry, type ProducerManifest } from "@hos-ai/sdk";

import {
  type CloudbedsReservation,
  type CloudbedsRoomBlock,
  type CloudbedsRoomStatus,
  type CloudbedsWebhook,
  createCloudbedsAdapter,
} from "@/lib/hos/mappings/cloudbeds";
import { liveManifest, synchronise, type SyncOptions, type SyncReport } from "@/lib/hos/mappings/sync";

// A first synchronisation of the experimental Cloudbeds mapping with a live Cloudbeds property: every room status, room
// block and reservation goes through the adapter as if a webhook had named it. lib/hos/mappings/sync.ts runs it and
// builds the report.

export type CloudbedsSnapshot = {
  fetchedAt: string;
  // The property's time zone and its standard check-in and check-out times, in 24-hour HH:MM.
  property: { id: string; timezone: string; checkInTime: string; checkOutTime: string };
  // getReservation's data for each reservation in the window.
  reservations: CloudbedsReservation[];
  // getHousekeepingStatus's data.
  rooms: CloudbedsRoomStatus[];
  // getRoomBlocks's roomBlocks.
  roomBlocks: CloudbedsRoomBlock[];
};

// Each room block as Cloudbeds dates it, next to the maintenance window the adapter read for each of its rooms: null for
// a room that became no window, such as a courtesy hold's.
export type CloudbedsBlockWindow = {
  type: string;
  start_date: string;
  end_date: string;
  rooms: Array<{ room: string | null; starts_at: string | null; ends_at: string | null }>;
};

export type CloudbedsSyncReport = SyncReport<{ reservations: number; rooms: number; room_blocks: number }> & { room_blocks: CloudbedsBlockWindow[] };

export function cloudbedsManifest(options: SyncOptions): ProducerManifest {
  return liveManifest(options, {
    name: "Cloudbeds API (live check)",
    types: [
      "reservation.created",
      "reservation.updated",
      "reservation.cancelled",
      "stay.expected",
      "stay.unit_assigned",
      "stay.unit_unassigned",
      "stay.checked_in",
      "stay.checked_out",
      "unit.maintenance_scheduled",
      "unit.maintenance_cancelled",
    ],
    dimensions: ["occupancy", "housekeeping", "commercial"],
    limitations: [
      "Synchronised from get operations: reservation and room facts are dated when they were fetched, with the recorded time basis, and room blocks by the fetch.",
    ],
  });
}

export function syncCloudbeds(snapshot: CloudbedsSnapshot, options: SyncOptions): CloudbedsSyncReport {
  let minted = 0;
  const identities = createIdentityRegistry({}, () => String(++minted).padStart(4, "0"));
  const { property } = snapshot;
  const adapter = () =>
    createCloudbedsAdapter({
      source: options.source,
      tenant: options.tenant,
      properties: [
        {
          cloudbedsPropertyId: property.id,
          propertyId: options.propertyId,
          timezone: property.timezone,
          checkInTime: property.checkInTime,
          checkOutTime: property.checkOutTime,
        },
      ],
      identities,
    });

  // No Cloudbeds event is named live-check, so the adapter reports nothing as happening at the webhook's time except
  // room blocks: what it only saw in a fetch is dated when it was recorded.
  const webhook = (object: string, ids: Partial<CloudbedsWebhook>): CloudbedsWebhook => ({
    version: "1.0",
    event: `${object}/live-check`,
    timestamp: Date.parse(snapshot.fetchedAt) / 1000,
    propertyID: property.id,
    ...ids,
  });
  const received_at = snapshot.fetchedAt;
  // Rooms first, then their blocks, then the reservations that use them, as an integration would load a property.
  const deliveries = (cloudbeds: ReturnType<typeof adapter>) => [
    ...snapshot.rooms.map(({ roomID }) => ({
      event: "housekeeping/live-check",
      id: roomID ?? "",
      handle: () => cloudbeds.handle({ received_at, webhook: webhook("housekeeping", { roomID }), rooms: snapshot.rooms }),
    })),
    ...snapshot.roomBlocks.map(({ roomBlockID }) => ({
      event: "roomblock/live-check",
      id: roomBlockID,
      handle: () => cloudbeds.handle({ received_at, webhook: webhook("roomblock", { roomBlockID }), roomBlocks: snapshot.roomBlocks }),
    })),
    ...snapshot.reservations.map((reservation) => ({
      event: "reservation/live-check",
      id: reservation.reservationID,
      handle: () => cloudbeds.handle({ received_at, webhook: webhook("reservation", { reservationID: reservation.reservationID }), reservation }),
    })),
  ];

  const report = synchronise({
    fetched: { reservations: snapshot.reservations.length, rooms: snapshot.rooms.length, room_blocks: snapshot.roomBlocks.length },
    fetchedAt: snapshot.fetchedAt,
    timezone: property.timezone,
    deliveries: deliveries(adapter()),
    restarted: deliveries(adapter()),
    manifest: cloudbedsManifest(options),
    unitNames: () =>
      new Map(
        snapshot.rooms.flatMap((room) => (room.roomID && room.roomName ? [[identities.resolve("unit", room.roomID), room.roomName] as const] : [])),
      ),
  });

  const windows = new Map(
    report.events.flatMap((event) => (event.type === "unit.maintenance_scheduled" ? [[event.data.maintenance_id, event.data] as const] : [])),
  );
  const roomNames = new Map(snapshot.rooms.map((room) => [room.roomID, room.roomName]));
  const room_blocks = snapshot.roomBlocks.map((block) => ({
    type: block.roomBlockType,
    start_date: block.startDate,
    end_date: block.endDate,
    rooms: block.rooms.map(({ eventID, roomID }) => {
      const window = windows.get(identities.resolve("maintenance", eventID));
      return { room: roomNames.get(roomID) ?? null, starts_at: window?.starts_at ?? null, ends_at: window?.ends_at ?? null };
    }),
  }));
  return { ...report, room_blocks };
}
