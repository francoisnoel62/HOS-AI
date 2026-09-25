import { createIdentityRegistry } from "@/lib/hos/mappings/common";
import { createMewsAdapter, type MewsReservation, type MewsResource, type MewsResourceBlock } from "@/lib/hos/mappings/mews";
import { liveManifest, synchronise, type SyncOptions, type SyncReport } from "@/lib/hos/mappings/sync";
import type { ProducerManifest } from "@/lib/hos/types";

// A first synchronisation of the experimental Mews mapping with a live Mews enterprise: every fetched entity goes through
// the adapter as if a General Webhook had named it. lib/hos/mappings/sync.ts runs it and builds the report.

export type MewsSnapshot = {
  fetchedAt: string;
  enterprise: { id: string; timezone: string };
  accommodationServiceIds: string[];
  reservations: MewsReservation[];
  resources: MewsResource[];
  resourceBlocks: MewsResourceBlock[];
};

export type MewsSyncReport = SyncReport<{ reservations: number; resources: number; resource_blocks: number }>;

export function mewsManifest(options: SyncOptions): ProducerManifest {
  return liveManifest(options, {
    name: "Mews Connector API (live check)",
    types: ["reservation.created", "reservation.updated", "reservation.cancelled", "stay.expected", "stay.unit_assigned", "stay.unit_unassigned", "stay.checked_in", "stay.checked_out", "unit.maintenance_scheduled", "unit.maintenance_cancelled"],
    dimensions: ["housekeeping", "maintenance"],
    limitations: ["Synchronised from Get all operations; Mews dates assignments and room states by the entity's last update."],
  });
}

export function syncMews(snapshot: MewsSnapshot, options: SyncOptions): MewsSyncReport {
  let minted = 0;
  const identities = createIdentityRegistry({}, () => String(++minted).padStart(4, "0"));
  const adapter = createMewsAdapter({
    source: options.source,
    tenant: options.tenant,
    properties: [{ enterpriseId: snapshot.enterprise.id, propertyId: options.propertyId, timezone: snapshot.enterprise.timezone, accommodationServiceIds: snapshot.accommodationServiceIds }],
    identities,
  });

  // Units first, then their blocks, then the reservations that use them, as an integration would load a property.
  const named: Array<[string, Array<{ Id: string }>]> = [
    ["ResourceUpdated", snapshot.resources],
    ["ResourceBlockUpdated", snapshot.resourceBlocks],
    ["ServiceOrderUpdated", snapshot.reservations],
  ];
  const deliveries = named.flatMap(([discriminator, entities]) =>
    entities.map(({ Id }) => ({
      event: discriminator,
      id: Id,
      handle: () =>
        adapter.handle({
          received_at: snapshot.fetchedAt,
          webhook: { EnterpriseId: snapshot.enterprise.id, IntegrationId: "live-check", Events: [{ Discriminator: discriminator, Value: { Id } }] },
          reservations: snapshot.reservations,
          resources: snapshot.resources,
          resourceBlocks: snapshot.resourceBlocks,
        }),
    })),
  );

  return synchronise({
    fetched: { reservations: snapshot.reservations.length, resources: snapshot.resources.length, resource_blocks: snapshot.resourceBlocks.length },
    fetchedAt: snapshot.fetchedAt,
    timezone: snapshot.enterprise.timezone,
    deliveries,
    manifest: mewsManifest(options),
    unitNames: () => new Map(snapshot.resources.map((resource) => [identities.resolve("unit", resource.Id), resource.Name])),
  });
}
