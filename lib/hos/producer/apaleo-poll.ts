import type { HosFact } from "@hos-ai/sdk";

import {
  type ApaleoAdapterState,
  type ApaleoDelivery,
  type ApaleoMaintenance,
  type ApaleoReservation,
  type ApaleoUnit,
  type ApaleoWebhook,
  createApaleoAdapter,
} from "@/lib/hos/mappings/apaleo";
import { type ApaleoClient, apaleoTime } from "@/lib/hos/mappings/apaleo-client";
import { withUnitGroupTypes } from "@/lib/hos/mappings/apaleo-sync";
import type { Poll } from "@/lib/hos/producer/poll";

// Polling an Apaleo property for the pilot's persistent producer (FO-02 of FINISH-OBSERVE). Each poll reads:
// - the bedroom reservations staying in the window, from yesterday to days ahead, and those modified since the previous
//   poll, so a reservation moved out of the window is read too;
// - the property's units and unit groups;
// - its maintenances in the window. Apaleo lists no deleted maintenance, so a maintenance the adapter published, that
//   falls in the window and that the list no longer has, is fetched by id: Apaleo no longer knows a deleted one, and
//   gives a moved one with its new dates.
// Every entity then goes to the Apaleo adapter, restarted from its stored state, which publishes only what changed. The
// poll is read-only: it sends GET requests only.

export type ApaleoPollOptions = {
  source: string;
  tenant: string;
  propertyId: string;
  apaleoPropertyId: string;
  // Whether the property inspects its rooms, so that Clean means inspected; Apaleo's API does not say.
  inspections: boolean;
  // How many days ahead of today the window of reservations and maintenances reaches.
  days: number;
};

// The adapter's state, and when the previous poll began to read Apaleo.
export type ApaleoPollState = { adapter?: ApaleoAdapterState; polledAt?: string };

const day = 86_400_000;
// The previous poll is read again from a little before it began, so a change Apaleo records as a poll runs is not lost.
const overlapMs = 5 * 60_000;
// The adapter only checks that the webhooks it is handed name the account it is configured with.
const accountId = "pilot-producer";

// The latest version of each reservation read twice.
function latest(...lists: ApaleoReservation[][]) {
  const byId = new Map<string, ApaleoReservation>();
  for (const item of lists.flat()) {
    const known = byId.get(item.id);
    if (!known || Date.parse(item.modified) > Date.parse(known.modified)) byId.set(item.id, item);
  }
  return [...byId.values()];
}

export function apaleoPoll(apaleo: ApaleoClient, options: ApaleoPollOptions): Poll<ApaleoPollState> {
  return async ({ state, identities, now }) => {
    const at = now.getTime();
    const property = await apaleo.find<{ id: string; timeZone: string }>(`/inventory/v1/properties/${options.apaleoPropertyId}`);
    if (!property) throw new Error(`Apaleo does not know the property ${options.apaleoPropertyId}.`);
    const scope = { propertyId: property.id };
    const range = { from: apaleoTime(at - day), to: apaleoTime(at + (options.days + 1) * day) };
    const reservationsBy = (filter: Record<string, string>) =>
      apaleo.list<ApaleoReservation>("/booking/v1/reservations", "reservations", { propertyIds: property.id, unitGroupTypes: "BedRoom", ...filter });

    const [unitGroups, units, maintenances, inWindow, modified] = await Promise.all([
      apaleo.list<{ id: string; type: string }>("/inventory/v1/unit-groups", "unitGroups", scope),
      apaleo.list<ApaleoUnit>("/inventory/v1/units", "units", scope),
      // Windows that end after the start of the range and begin before its end.
      apaleo.list<ApaleoMaintenance>("/operations/v1/maintenances", "maintenances", { ...scope, ...range }),
      reservationsBy({ dateFilter: "Stay", ...range }),
      state?.polledAt
        ? reservationsBy({ dateFilter: "Modification", from: apaleoTime(Date.parse(state.polledAt) - overlapMs), to: apaleoTime(at) })
        : [],
    ]);

    // The published maintenances the list should have had.
    const listed = new Set(maintenances.map((maintenance) => maintenance.id));
    const missing = Object.entries(state?.adapter?.windows ?? {})
      .filter(([id, published]) => {
        if (published.cancelled || listed.has(id)) return false;
        const plan = JSON.parse(published.plan) as { starts_at: string; ends_at: string };
        return Date.parse(plan.ends_at) > Date.parse(range.from) && Date.parse(plan.starts_at) < Date.parse(range.to);
      })
      .map(([id]) => id);
    const found = await Promise.all(
      missing.map(async (id) => ({ id, maintenance: await apaleo.find<ApaleoMaintenance>(`/operations/v1/maintenances/${id}`) })),
    );

    const adapter = createApaleoAdapter(
      {
        source: options.source,
        tenant: options.tenant,
        accountId,
        properties: [
          { apaleoPropertyId: property.id, propertyId: options.propertyId, timezone: property.timeZone, inspections: options.inspections },
        ],
        identities,
      },
      state?.adapter,
    );
    const typed = withUnitGroupTypes(unitGroups);
    const received_at = new Date(at).toISOString();
    // A changed event names no particular change, so assignments are dated by the reservation's last modification.
    const webhook = (topic: string, type: string, entityId: string): ApaleoWebhook => ({
      topic,
      type,
      id: "pilot-producer",
      accountId,
      propertyId: property.id,
      timestamp: at,
      data: { entityId },
    });
    // Units first, then their maintenances, then the reservations that use them, as an integration loads a property.
    const deliveries: Array<[string, ApaleoDelivery]> = [
      ...units
        .map(typed)
        .map((unit): [string, ApaleoDelivery] => [`Unit ${unit.id}`, { received_at, webhook: webhook("Unit", "changed", unit.id), unit }]),
      ...maintenances.map((maintenance): [string, ApaleoDelivery] => [
        `Maintenance ${maintenance.id}`,
        { received_at, webhook: webhook("Maintenance", "changed", maintenance.id), maintenance },
      ]),
      ...found.map(({ id, maintenance }): [string, ApaleoDelivery] => [
        `Maintenance ${id}`,
        maintenance
          ? { received_at, webhook: webhook("Maintenance", "changed", id), maintenance }
          : { received_at, webhook: webhook("Maintenance", "deleted", id) },
      ]),
      ...latest(inWindow, modified)
        .map(typed)
        .map((reservation): [string, ApaleoDelivery] => [
          `Reservation ${reservation.id}`,
          { received_at, webhook: webhook("Reservation", "changed", reservation.id), reservation },
        ]),
    ];

    const events: HosFact[] = [];
    for (const [label, delivery] of deliveries) {
      try {
        events.push(...adapter.handle(delivery).events);
      } catch (error) {
        // The whole poll fails, and says which entity: nothing is written, and the status shows the error.
        throw new Error(`Apaleo ${label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { events, state: { adapter: adapter.state(), polledAt: received_at } };
  };
}
