# Conformance protocol `hos-conformance/1`

How `hos conformance run` talks to an implementation under test, so that an implementation written in any language can replay the conformance scenarios and get a verdict:

```sh
npx @hos-ai/cli conformance run arrival-readiness --impl "python impl.py"
```

Status: draft, like HOS 0.1. The protocol is versioned separately from the specification; a change that breaks existing implementations gets a new version.

## Running an implementation

- The tool starts the `--impl` command once per scenario, through the system shell, in the directory `hos` runs from.
- It writes the whole scenario to the command's standard input as JSON Lines, then closes standard input. Everything is sent at once: an implementation reads until end of input and never waits on the tool, so the two cannot block each other.
- The implementation writes its results to standard output as JSON Lines, one line per delivery, and exits with code 0. Standard error is free for logs.
- A scenario fails when the command exits with another code, writes a line that is not JSON, or has not finished after the timeout, 30 seconds by default (`--timeout`). The tool then shows the end of standard error.

## Input

Each line is a JSON object whose `kind` says what it holds, in this order:

1. One `scenario` line:

   ```json
   {"kind": "scenario", "protocol": "hos-conformance/1", "level": "reference", "scenario": "arrival-readiness", "tenant": {"id": "tenant_demo"}, "property": {"id": "prop_demo", "timezone": "Europe/Paris", "country": "FR"}, "projection": {"ready_housekeeping_statuses": ["clean", "inspected"]}}
   ```

   `protocol` is the protocol version; an implementation that does not know it exits with a non-zero code. `level` is the level the tool compares (see below). `projection` configures the reference projection: the housekeeping statuses that make a unit ready.

2. One `manifest` line per producer, holding its Event Producer manifest:

   ```json
   {"kind": "manifest", "manifest": {"hosmanifestversion": "0.1", "producer": "urn:hos:pms:demo", "...": "..."}}
   ```

3. One `delivery` line per delivery, in delivery order, holding the HOS event exactly as delivered:

   ```json
   {"kind": "delivery", "delivery": 1, "event": {"specversion": "1.0", "id": "pms-000312", "...": "..."}}
   ```

## Output

One line per delivery, in any order:

```json
{"delivery": 6, "disposition": "applied", "stays": {"stay_1042": {"readiness": "not_ready", "situation": "at_risk"}}, "situations": [{"specversion": "1.0", "type": "arrival.room_readiness_at_risk", "...": "..."}]}
```

- `delivery`: the number of the delivery.
- `disposition`: what the implementation did with it: `applied`, `duplicate`, `superseded`, `non_authoritative` or `undeclared_capability`.
- `stays`: after the delivery, for every stay the implementation knows, its `readiness` (`unknown`, `not_ready` or `ready`) and the state of its `situation` (`none`, `at_risk` or `resolved`).
- `situations`: the reference situations the delivery raised, as complete events, in the order they were raised. An empty array when there are none.

Other members are ignored.

## Levels and verdict

`expected.json` pins down two things of different standing, so the tool reports them apart:

- **normative**: the dispositions. They follow the processing rules of HOS Events 0.1: deduplication on source and id, occurrence order, declared capability and authority. Every conformant consumer must reach them.
- **reference**: readiness and situations, which come from the arrival-readiness reference projection. That projection is non-normative: a consumer can assess arrivals differently and still follow HOS Events 0.1.

With `--level normative`, the tool compares only dispositions, and an implementation may leave out `stays` and `situations`. With `--level reference`, the default, it compares everything. A report reads, for example, `normative 13/13 · reference 13/13 · situations 2/2`.

The comparison follows the `compare` rule of `expected.json`: for every delivery, the disposition and, for every known stay, its readiness and situation. Situations are compared on every attribute except `id` and `hosrecordedat`, which are implementation-defined. Each difference is reported with its delivery, its JSON path, the expected value and the value received.

## The reference implementation

`hos reference-impl` implements this protocol with the SDK's reference projection. `hos conformance run --all --impl "hos reference-impl"` passes every scenario; it is the tool's own check. `examples/python-dispositions/` in the HOS AI repository implements the normative level in Python.
