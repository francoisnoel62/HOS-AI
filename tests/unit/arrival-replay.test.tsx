import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ArrivalReplay } from "@/components/demo/arrival-replay";
import { loadArrivalScenario } from "@/lib/hos/conformance";
import { replayArrivalReadiness } from "@/lib/hos/projection";
import type { HosFact } from "@/lib/hos/types";

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
});
