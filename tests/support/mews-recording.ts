import type { IdentityRegistry } from "@hos-ai/sdk";

import type { RecordedDelivery } from "@/lib/hos/mappings/common";
import type { MewsAdapterConfig, MewsDelivery, MewsReservation, MewsResource, MewsWebhook } from "@/lib/hos/mappings/mews";
import { loadRecording } from "@/lib/hos/mappings/replay";

// The recorded Mews deliveries of the arrival scenario, as the producer tests hand them to the Mews adapter.

export const mewsRecording = loadRecording("mews");

// A recorded delivery as the adapter receives it, or as if received at another time.
export function mewsDelivery({ received_at, webhook, fetched }: RecordedDelivery, at = received_at): MewsDelivery {
  const responses = fetched.map((call) => call.response as { Reservations?: MewsReservation[]; Resources?: MewsResource[] });
  return {
    received_at: at,
    webhook: webhook as MewsWebhook,
    reservations: responses.flatMap((response) => response.Reservations ?? []),
    resources: responses.flatMap((response) => response.Resources ?? []),
  };
}

// The recording's adapter configuration, for another tenant and with the producer's identities.
export const mewsAdapterConfig = (tenant: string, identities: IdentityRegistry): MewsAdapterConfig => ({
  ...(mewsRecording.adapter as unknown as MewsAdapterConfig),
  tenant,
  identities,
});
