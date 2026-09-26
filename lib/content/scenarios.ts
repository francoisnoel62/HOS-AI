import type { ConformanceScenarioId } from "@/lib/hos/conformance";

// Demo copy for the conformance scenarios. The scenario files themselves stay free of presentation.

export type ScenarioDemo = {
  href: string;
  label: string;
  // The stay the replay follows.
  stayId: string;
  title: string;
  description: string;
  card: string;
  metaTitle: string;
  metaDescription: string;
};

export const scenarioDemos: Record<ConformanceScenarioId, ScenarioDemo> = {
  "arrival-readiness": {
    href: "/demo",
    label: "Early arrival",
    stayId: "stay_1042",
    title: "Watch an early arrival meet a room that is not ready.",
    description:
      "A guest is due at 15:00 but writes that they will arrive around 12:30, and their room is not ready. The PMS, housekeeping and the messaging tool send HOS thirteen updates: one arrives twice, one comes from a system that is not entitled to send it, two contradict each other and one arrives late. Step through them and watch HOS raise the alert before the guest walks in, then clear it once the room is inspected.",
    card: "The guest will come three hours early and the room is not released. A duplicate, a conflict, a late message and a snapshot along the way.",
    metaTitle: "Live demo: arrival readiness",
    metaDescription: "Step through thirteen updates from a PMS, a housekeeping system and guest messaging, with made-up data, and watch HOS raise, then clear, an alert when a guest arriving early meets a room that is not ready.",
  },
  "room-out-of-order": {
    href: "/demo/room-out-of-order",
    label: "Room out of order",
    stayId: "stay_2051",
    title: "Watch a room go out of order on the day of arrival.",
    description:
      "On the morning of arrival, a leak puts the guest's room out of order. The maintenance system plans the repair, the PMS copies the information, and an old version of the plan arrives late. Watch HOS raise the alert as soon as the repair is planned, trust the maintenance system over the PMS's copy, ignore the outdated plan, and clear the alert when the front desk moves the guest to another room.",
    card: "A leak on the arrival morning. The maintenance system plans the repair, the PMS copies it, and the front desk moves the guest.",
    metaTitle: "Live demo: room out of order",
    metaDescription: "Step through fourteen updates from a PMS, a housekeeping system and a maintenance system, with made-up data, and watch HOS raise, then clear, an alert when a guest's room goes out of order on the day of arrival.",
  },
  "late-checkout": {
    href: "/demo/late-checkout",
    label: "Late check-out",
    stayId: "stay_3140",
    title: "Watch a late check-out collide with an arrival.",
    description:
      "The front desk grants a late check-out in a room already promised to a guest arriving the same afternoon. Watch HOS notice that the room is still occupied and raise the alert. A room attendant seeing an empty room is not a check-out, so HOS keeps the alert until the PMS records the departure, and ignores an outdated plan along the way.",
    card: "A late check-out is granted in a room already assigned to an arrival. The room stays held until the PMS records the departure.",
    metaTitle: "Live demo: late check-out",
    metaDescription: "Step through fifteen updates from a PMS and a housekeeping system, with made-up data, and watch HOS raise, then clear, an alert when a late check-out overlaps a same-day arrival in the same room.",
  },
};
