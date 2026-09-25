import type { Metadata } from "next";

import { ScenarioDemo, scenarioMetadata } from "@/components/demo/scenario-demo";

export const metadata: Metadata = scenarioMetadata("room-out-of-order");

export default function RoomOutOfOrderPage() {
  return <ScenarioDemo id="room-out-of-order" />;
}
