import type { HosFact } from "@hos-ai/sdk";

import { createMewsAdapter, type MewsAdapterState, type MewsReservation, type MewsResource, type MewsResourceBlock } from "@/lib/hos/mappings/mews";
import { fetchMewsEnterprise, type MewsClient } from "@/lib/hos/mappings/mews-client";
import type { Poll } from "@/lib/hos/producer/poll";

// Polling a Mews enterprise for the pilot's persistent producer (FO-02 of FINISH-OBSERVE). Each poll reads:
// - the reservations of the window, from yesterday to days ahead, and those updated since the previous poll, so a
//   reservation moved out of the window is read too;
// - the enterprise's spaces;
// - its resource blocks of the window and those updated since, deleted ones included, so a deleted block is read as
//   such rather than missing.
// Every entity then goes to the Mews adapter, restarted from its stored state, which publishes only what changed since
// it last published. The poll is read-only: it calls Get operations only.

export type MewsPollOptions = {
  source: string;
  tenant: string;
  propertyId: string;
  // How many days ahead of today the window of reservations and blocks reaches.
  days: number;
  // Overrides the accommodation services Mews's configuration gives.
  serviceIds?: string[];
};

// The adapter's state, and when the previous poll began to read Mews.
export type MewsPollState = { adapter?: MewsAdapterState; polledAt?: string };

const day = 86_400_000;
// The previous poll is read again from a little before it began, so a change Mews records as a poll runs is not lost.
const overlapMs = 5 * 60_000;
// Mews takes an UpdatedUtc interval of at most three months and a day. A producer stopped longer reads the last 90 days
// of changes, and the window.
const updatedMaxMs = 90 * day;

const iso = (ms: number) => new Date(ms).toISOString();

// The latest version of each entity read twice.
function latest<T extends { Id: string; UpdatedUtc: string }>(...lists: T[][]) {
  const byId = new Map<string, T>();
  for (const item of lists.flat()) {
    const known = byId.get(item.Id);
    if (!known || Date.parse(item.UpdatedUtc) > Date.parse(known.UpdatedUtc)) byId.set(item.Id, item);
  }
  return [...byId.values()];
}

export function mewsPoll(mews: MewsClient, options: MewsPollOptions): Poll<MewsPollState> {
  return async ({ state, identities, now }) => {
    const at = now.getTime();
    const { enterprise, accommodation } = await fetchMewsEnterprise(mews, options.serviceIds);
    const scope = { EnterpriseIds: [enterprise.id] };
    const window = { StartUtc: iso(at - day), EndUtc: iso(at + (options.days + 1) * day) };
    const since = state?.polledAt
      ? { StartUtc: iso(Math.max(Date.parse(state.polledAt) - overlapMs, at - updatedMaxMs)), EndUtc: iso(at) }
      : undefined;
    const reservationsBy = (filter: Record<string, unknown>) =>
      mews.getAll<MewsReservation>("reservations/getAll/2023-06-06", "Reservations", { ...scope, ServiceIds: accommodation, ...filter });
    const blocksBy = (filter: Record<string, unknown>) =>
      mews.getAll<MewsResourceBlock>("resourceBlocks/getAll", "ResourceBlocks", { ...scope, ActivityStates: ["Active", "Deleted"], ...filter });

    const [inWindow, updated, resources, blocksInWindow, updatedBlocks] = await Promise.all([
      reservationsBy({ CollidingUtc: window }),
      since ? reservationsBy({ UpdatedUtc: since }) : [],
      mews.getAll<MewsResource>("resources/getAll", "Resources", { ...scope, Extent: { Resources: true, Inactive: false } }),
      blocksBy({ CollidingUtc: window }),
      since ? blocksBy({ UpdatedUtc: since }) : [],
    ]);
    const reservations = latest(inWindow, updated);
    const resourceBlocks = latest(blocksInWindow, updatedBlocks);

    const adapter = createMewsAdapter(
      {
        source: options.source,
        tenant: options.tenant,
        properties: [
          { enterpriseId: enterprise.id, propertyId: options.propertyId, timezone: enterprise.timezone, accommodationServiceIds: accommodation },
        ],
        identities,
      },
      state?.adapter,
    );
    const events: HosFact[] = [];
    // Spaces first, then their blocks, then the reservations that use them, as an integration loads a property.
    const entities: Array<[string, Array<{ Id: string }>]> = [
      ["ResourceUpdated", resources],
      ["ResourceBlockUpdated", resourceBlocks],
      ["ServiceOrderUpdated", reservations],
    ];
    for (const [discriminator, list] of entities)
      for (const { Id } of list) {
        try {
          const result = adapter.handle({
            received_at: iso(at),
            webhook: { EnterpriseId: enterprise.id, IntegrationId: "pilot-producer", Events: [{ Discriminator: discriminator, Value: { Id } }] },
            reservations,
            resources,
            resourceBlocks,
          });
          events.push(...result.events);
        } catch (error) {
          // The whole poll fails, and says which entity: nothing is written, and the status shows the error.
          throw new Error(`Mews ${discriminator} ${Id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    return { events, state: { adapter: adapter.state(), polledAt: iso(at) } };
  };
}
