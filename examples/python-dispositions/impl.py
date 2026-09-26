#!/usr/bin/env python3
"""The normative level of the hos-conformance/1 protocol, in Python.

It applies the processing rules of HOS Events 0.1 (deduplication on source and id, occurrence order, declared
capability and authority) and answers each delivery with its disposition. It does not implement the non-normative
arrival-readiness projection, so it runs at the normative level:

    npx @hos-ai/cli conformance run --all --level normative --impl "python3 impl.py"

It needs Python 3.11 or later and nothing else.
"""

import json
import sys
from datetime import datetime

PROTOCOL = "hos-conformance/1"


def later(candidate, current):
    """The later occurrence wins. Equal times fall back to source, then id, so every implementation agrees."""
    if current is None:
        return True
    ours, theirs = datetime.fromisoformat(candidate["time"]), datetime.fromisoformat(current["time"])
    if ours != theirs:
        return ours > theirs
    if candidate["source"] != current["source"]:
        return candidate["source"] > current["source"]
    return candidate["id"] > current["id"]


class Consumer:
    def __init__(self, manifests):
        self.manifests = manifests
        self.seen = set()
        # The latest fact for each entity, per kind of fact.
        self.latest = {kind: {} for kind in ("reservation", "stay", "assignment", "lifecycle", "status", "task", "arrival", "maintenance")}
        # Non-authoritative observations: per unit and dimension, the latest fact of each source.
        self.observations = {}

    def declaration(self, event, dimension=None):
        """A producer may only emit what its manifest declares for the property; anything undeclared is denied."""
        for manifest in self.manifests:
            if manifest["producer"] == event["source"] and event["hosproperty"] in manifest["property_ids"]:
                for declared in manifest["events"]:
                    if declared["type"] == event["type"] and (dimension is None or "dimensions" not in declared or dimension in declared["dimensions"]):
                        return declared
                return None
        return None

    def authority(self, event, dimension=None):
        declared = self.declaration(event, dimension)
        if declared is None or (event.get("hosdatamode") == "snapshot" and not declared.get("snapshot")):
            return "undeclared_capability"
        return "authoritative" if declared["authoritative"] else "non_authoritative"

    def keep_latest(self, store, key, event):
        if not later(event, store.get(key)):
            return "superseded"
        store[key] = event
        return "applied"

    def observe(self, key, event):
        by_source = self.observations.setdefault(key, {})
        return "non_authoritative" if self.keep_latest(by_source, event["source"], event) == "applied" else "superseded"

    def status(self, event):
        data = event["data"]
        changes = list(data["statuses"]) if "statuses" in data else [data["dimension"]]
        outcomes = []
        for dimension in changes:
            standing = self.authority(event, dimension)
            key = f"{data['unit_id']}|{dimension}"
            if standing == "undeclared_capability":
                outcomes.append(standing)
            elif standing == "authoritative":
                outcomes.append(self.keep_latest(self.latest["status"], key, event))
            else:
                outcomes.append(self.observe(key, event))
        # A snapshot reports the strongest effect among its dimensions.
        return next((outcome for outcome in ("applied", "non_authoritative", "superseded") if outcome in outcomes), "undeclared_capability")

    def ingest(self, event):
        identity = (event["source"], event["id"])
        if identity in self.seen:
            return "duplicate"
        self.seen.add(identity)
        if event["type"] == "unit.status_changed":
            return self.status(event)
        standing = self.authority(event)
        if standing != "authoritative":
            return standing

        kind, data, latest = event["type"], event["data"], self.latest
        if kind in ("reservation.created", "reservation.cancelled") or (kind == "reservation.updated" and data.get("status")):
            return self.keep_latest(latest["reservation"], data["reservation_id"], event)
        if kind == "stay.expected":
            return self.keep_latest(latest["stay"], data["stay_id"], event)
        if kind == "stay.unit_assigned":
            return self.keep_latest(latest["assignment"], data["stay_id"], event)
        if kind == "stay.unit_unassigned":
            # A release frees only the unit the stay holds; releasing another unit changes nothing.
            held = latest["assignment"].get(data["stay_id"])
            if held and held["type"] == "stay.unit_assigned" and held["data"]["unit_id"] != data["unit_id"]:
                return "superseded"
            return self.keep_latest(latest["assignment"], data["stay_id"], event)
        if kind in ("stay.checked_in", "stay.check_in_reverted", "stay.checked_out"):
            return self.keep_latest(latest["lifecycle"], data["stay_id"], event)
        if kind in ("housekeeping.task.created", "housekeeping.task.completed") and data.get("unit_id"):
            return self.keep_latest(latest["task"], data["unit_id"], event)
        if kind in ("unit.maintenance_scheduled", "unit.maintenance_cancelled"):
            return self.keep_latest(latest["maintenance"], data["maintenance_id"], event)
        if kind == "guest.message.received":
            signals = [signal for signal in data.get("signals", []) if signal["kind"] in ("early_arrival", "late_arrival")]
            if signals and data.get("stay_id"):
                return self.keep_latest(latest["arrival"], data["stay_id"], event)
        # A fact that changes no state this consumer keeps, such as a reservation update without a status.
        return "applied"


def main():
    lines = [json.loads(line) for line in sys.stdin.read().splitlines() if line.strip()]
    scenario = next((line for line in lines if line["kind"] == "scenario"), {})
    if scenario.get("protocol") != PROTOCOL:
        print(f"this implementation speaks {PROTOCOL}, not {scenario.get('protocol')}", file=sys.stderr)
        return 2
    consumer = Consumer([line["manifest"] for line in lines if line["kind"] == "manifest"])
    for line in lines:
        if line["kind"] == "delivery":
            print(json.dumps({"delivery": line["delivery"], "disposition": consumer.ingest(line["event"])}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
