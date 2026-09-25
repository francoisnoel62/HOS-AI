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
    title: "Replay an early arrival, one fact at a time.",
    description:
      "A PMS, a housekeeping system and a guest messaging platform send thirteen facts about one stay. Watch HOS ignore a duplicate, deny an undeclared capability, keep a conflicting status visible, set aside a late message, recover from a snapshot, and raise a room-readiness risk before the guest walks in.",
    card: "The guest will come three hours early and the room is not released. A duplicate, a conflict, a late message and a snapshot along the way.",
    metaTitle: "Live demo: arrival readiness",
    metaDescription: "Replay thirteen synthetic HOS Events 0.1 facts from a PMS, a housekeeping system and guest messaging, and watch the reference projection detect, then resolve, an early-arrival room-readiness risk.",
  },
  "room-out-of-order": {
    href: "/demo/room-out-of-order",
    label: "Room out of order",
    stayId: "stay_2051",
    title: "Replay a room going out of order on the arrival day.",
    description:
      "A leak takes the guest's assigned room out of order in the morning. Watch HOS raise the risk from a maintenance plan, keep the plan apart from the room's status, ignore the PMS's copy of the block, set aside an older revision that syncs late, and resolve the risk when the front desk moves the guest.",
    card: "A leak on the arrival morning. The maintenance system plans the repair, the PMS copies it, and the front desk moves the guest.",
    metaTitle: "Live demo: room out of order",
    metaDescription: "Replay fourteen synthetic HOS Events 0.1 facts from a PMS, a housekeeping system and a maintenance system, and watch the reference projection raise and resolve a risk when an assigned room goes out of order.",
  },
  "late-checkout": {
    href: "/demo/late-checkout",
    label: "Late check-out",
    stayId: "stay_3140",
    title: "Replay a late check-out that collides with an arrival.",
    description:
      "The front desk grants a late check-out in a room already promised to a guest arriving the same afternoon. Watch HOS see that the room is still held, raise the risk, refuse to take a room attendant's glance for a check-out, set aside a stale plan, and resolve the risk when the departing guest actually leaves.",
    card: "A late check-out is granted in a room already assigned to an arrival. The room stays held until the PMS records the departure.",
    metaTitle: "Live demo: late check-out",
    metaDescription: "Replay fifteen synthetic HOS Events 0.1 facts from a PMS and a housekeeping system, and watch the reference projection raise and resolve a risk when a late check-out overlaps a same-day arrival.",
  },
};
