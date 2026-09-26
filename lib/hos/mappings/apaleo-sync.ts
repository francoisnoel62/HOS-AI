import { type ApaleoMaintenance, type ApaleoReservation, type ApaleoUnit, type ApaleoWebhook, createApaleoAdapter } from "@/lib/hos/mappings/apaleo";
import { createIdentityRegistry } from "@/lib/hos/mappings/common";
import { liveManifest, synchronise, type SyncOptions, type SyncReport } from "@/lib/hos/mappings/sync";
import type { ProducerManifest } from "@/lib/hos/types";

// A first synchronisation of the experimental Apaleo mapping with a live Apaleo property: every fetched unit, maintenance
// and reservation goes through the adapter as if a webhook had named it. lib/hos/mappings/sync.ts runs it and builds the
// report.

export type ApaleoSnapshot = {
  fetchedAt: string;
  // inspections is the property's own setting: Apaleo's API does not say whether a Clean unit was inspected.
  property: { id: string; timezone: string; inspections: boolean };
  unitGroups: Array<{ id: string; type: string }>;
  reservations: ApaleoReservation[];
  units: ApaleoUnit[];
  maintenances: ApaleoMaintenance[];
};

export type ApaleoSyncReport = SyncReport<{ reservations: number; units: number; maintenances: number }>;

// The synthetic webhooks carry no account: the adapter only checks that they name the configured one.
const accountId = "live-check";

export function apaleoManifest(options: SyncOptions): ProducerManifest {
  return liveManifest(options, {
    name: "Apaleo API (live check)",
    types: [
      "reservation.created",
      "reservation.updated",
      "reservation.cancelled",
      "stay.expected",
      "stay.unit_assigned",
      "stay.unit_unassigned",
      "stay.checked_in",
      "stay.check_in_reverted",
      "stay.checked_out",
      "unit.maintenance_scheduled",
      "unit.maintenance_cancelled",
    ],
    dimensions: ["occupancy", "housekeeping", "maintenance", "commercial"],
    limitations: ["Synchronised from list operations: unit statuses are dated by the fetch, and assignments by the reservation's last modification."],
  });
}

export function syncApaleo(snapshot: ApaleoSnapshot, options: SyncOptions): ApaleoSyncReport {
  let minted = 0;
  const identities = createIdentityRegistry({}, () => String(++minted).padStart(4, "0"));
  const { property } = snapshot;
  const adapter = createApaleoAdapter({
    source: options.source,
    tenant: options.tenant,
    accountId,
    properties: [{ apaleoPropertyId: property.id, propertyId: options.propertyId, timezone: property.timezone, inspections: property.inspections }],
    identities,
  });

  // The unit group embedded in a unit or reservation may omit its type, and the adapter only keeps bedrooms.
  const types = new Map(snapshot.unitGroups.map((group) => [group.id, group.type]));
  const typed = <T extends { unitGroup?: { id: string; type?: string } }>(item: T): T => (item.unitGroup && !item.unitGroup.type ? { ...item, unitGroup: { ...item.unitGroup, type: types.get(item.unitGroup.id) } } : item);
  const units = snapshot.units.map(typed);
  const reservations = snapshot.reservations.map(typed);

  // A changed event names no particular change, so assignments are dated by the reservation's last modification.
  const webhook = (topic: string, entityId: string): ApaleoWebhook => ({ topic, type: "changed", id: "live-check", accountId, propertyId: property.id, timestamp: Date.parse(snapshot.fetchedAt), data: { entityId } });
  // Units first, then their maintenances, then the reservations that use them, as an integration would load a property.
  const deliveries = [
    ...units.map((unit) => ({ event: "unit/changed", id: unit.id, handle: () => adapter.handle({ received_at: snapshot.fetchedAt, webhook: webhook("Unit", unit.id), unit }) })),
    ...snapshot.maintenances.map((maintenance) => ({ event: "maintenance/changed", id: maintenance.id, handle: () => adapter.handle({ received_at: snapshot.fetchedAt, webhook: webhook("Maintenance", maintenance.id), maintenance }) })),
    ...reservations.map((reservation) => ({ event: "reservation/changed", id: reservation.id, handle: () => adapter.handle({ received_at: snapshot.fetchedAt, webhook: webhook("Reservation", reservation.id), reservation }) })),
  ];

  return synchronise({
    fetched: { reservations: snapshot.reservations.length, units: snapshot.units.length, maintenances: snapshot.maintenances.length },
    fetchedAt: snapshot.fetchedAt,
    timezone: property.timezone,
    deliveries,
    manifest: apaleoManifest(options),
    unitNames: () => new Map(units.map((unit) => [identities.resolve("unit", unit.id), unit.name])),
  });
}
