import type { Metadata } from "next";

import { ScenarioDemo, scenarioMetadata } from "@/components/demo/scenario-demo";

export const metadata: Metadata = scenarioMetadata("late-checkout");

export default function LateCheckoutPage() {
  return <ScenarioDemo id="late-checkout" />;
}
