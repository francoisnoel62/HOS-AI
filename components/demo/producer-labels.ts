import type { ProducerManifest } from "@/lib/hos/types";

const roleLabels: Record<ProducerManifest["system_role"], string> = {
  pms: "PMS",
  housekeeping: "Housekeeping",
  messaging: "Messaging",
  maintenance: "Maintenance",
  integration: "Integration",
  other: "Other",
};

// Short producer names for the replay, from each manifest's declared role.
export function producerLabels(manifests: ProducerManifest[]): Record<string, string> {
  return Object.fromEntries(manifests.map((manifest) => [manifest.producer, roleLabels[manifest.system_role]]));
}
