import type { HosFact } from "@hos-ai/sdk";
import { replayArrivalReadiness } from "@hos-ai/sdk/reference";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ArrivalReplay } from "@/components/demo/arrival-replay";
import { loadArrivalScenario, loadScenario } from "@/lib/spec";

describe("arrival replay", () => {
  it("shows the maintenance window that blocks the unit, and the risk it raises", () => {
    const { scenario, manifests, events } = loadArrivalScenario();
    const [created, expected, assigned] = events;
    const window = {
      ...events.find((event) => event.type === "stay.checked_in")!,
      id: "pms-m1",
      type: "unit.maintenance_scheduled",
      time: "2026-07-29T08:00:00Z",
      hossubjects: "unit:unit_204",
      data: { maintenance_id: "mnt_7", unit_id: "unit_204", starts_at: "2026-07-30T06:00:00Z", ends_at: "2026-07-30T16:00:00Z", statuses: { maintenance: "out_of_service", commercial: "not_sellable" } },
    } as unknown as HosFact;
    const steps = replayArrivalReadiness([created, expected, assigned, window], manifests, scenario.projection);
    render(<ArrivalReplay notes={[]} producerLabels={{ "urn:hos:pms:demo": "PMS" }} stayId="stay_1042" steps={steps} timezone="Europe/Paris" />);

    for (let delivery = 0; delivery < steps.length; delivery += 1) fireEvent.click(screen.getByRole("button", { name: /Deliver next event/ }));
    const projection = screen.getByRole("region", { name: "Arrival-readiness projection" });
    expect(projection).toHaveTextContent("Maintenance window");
    expect(projection).toHaveTextContent("30 Jul, 08:00 – 30 Jul, 18:00");
    expect(projection).toHaveTextContent("out_of_service · not_sellable · PMS");
    expect(projection).toHaveTextContent("Readiness at risk");
  });

  it("names the guest who still holds the unit, and when they are due to leave", () => {
    const { scenario, manifests, events } = loadScenario("late-checkout");
    const steps = replayArrivalReadiness(events.slice(0, 7), manifests, scenario.projection);
    render(<ArrivalReplay notes={scenario.deliveries} producerLabels={{ "urn:hos:pms:demo": "PMS" }} stayId="stay_3140" steps={steps} timezone={scenario.property.timezone} />);

    for (let delivery = 0; delivery < steps.length; delivery += 1) fireEvent.click(screen.getByRole("button", { name: /Deliver next event/ }));
    const projection = screen.getByRole("region", { name: "Arrival-readiness projection" });
    expect(projection).toHaveTextContent("Unit still held by");
    expect(projection).toHaveTextContent("stay_3088");
    expect(projection).toHaveTextContent("due to leave 17:00 · checked in 18 Aug, 17:10 · PMS");
    expect(projection).toHaveTextContent("Readiness at risk");
  });
});
