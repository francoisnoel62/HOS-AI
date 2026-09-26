# @hos-ai/cli

The `hos` command for [HOS 0.1](https://hos-ai.vercel.app/docs), an open draft standard for hotel operations events. It validates HOS files, replays recorded event streams, tests an implementation against the conformance scenarios, checks what a producer publishes, and signs producer manifests.

> **Draft and alpha.** HOS 0.1 is a draft, `0.1.0-draft.2`, and this package is an alpha: commands and messages may still change. Passing the conformance scenarios is a self-check. It is not a certification, and no HOS certification exists yet.

## Requirements

Node.js 22 or later. Check with:

```sh
node --version
```

That is all. The schemas and the conformance scenarios are inside the package, so `hos` works offline.

## Install

Pick one:

| You want to                        | Run                                                            |
| :--------------------------------- | :------------------------------------------------------------- |
| try it without installing anything | `npx @hos-ai/cli <command>`                                    |
| have a `hos` command everywhere    | `npm install --global @hos-ai/cli`                             |
| pin a version in a project or a CI | `npm install --save-dev @hos-ai/cli`, then `npx hos <command>` |

Check the install:

```sh
hos --version
```

```text
@hos-ai/cli 0.1.0-alpha.1 (HOS 0.1.0-draft.2)
```

Below, `hos` stands for `npx @hos-ai/cli` if you did not install it.

## Five-minute start

These steps use files published on the HOS website. Download them with `curl -O`, or open the links and save the files.

### 1. Validate a file

```sh
curl -O https://hos-ai.vercel.app/spec/0.1/examples/stay.expected.json
hos validate stay.expected.json
```

```text
✓ stay.expected.json: valid event stay.expected
```

`hos validate` takes events, producer manifests and reference situations (`.json`), and event streams (`.jsonl`, one event per line).

### 2. Read an error

```sh
curl -O https://hos-ai.vercel.app/spec/0.1/examples/unit.status_changed.json
```

Open `unit.status_changed.json`, change `"current": "dirty"` to `"current": "cleaning"`, and validate it again:

```sh
hos validate unit.status_changed.json
```

```text
✗ unit.status_changed.json: invalid event unit.status_changed (1 error)
  error   data.current is "cleaning", not one of: dirty, clean, inspected, unknown. Readiness as reported by the housekeeping authority.
          rule core/unit-status-model · at /data/current
```

Each error names the field, the value found, what HOS allows, and the rule of the specification it breaks.

### 3. Replay an arrival

HOS publishes three conformance scenarios, and `hos` carries them:

```sh
hos conformance list
```

```text
arrival-readiness  Early arrival, unit not ready · 13 deliveries, 3 producers
late-checkout      Late check-out on a same-day turnover · 15 deliveries, 2 producers
room-out-of-order  Assigned unit out of order · 14 deliveries, 3 producers
```

Download the events of the first one, with the manifests of its three producers, and replay them:

```sh
curl -O https://hos-ai.vercel.app/spec/0.1/conformance/arrival-readiness/events.jsonl
curl -O https://hos-ai.vercel.app/spec/0.1/conformance/arrival-readiness/producers/pms.json
curl -O https://hos-ai.vercel.app/spec/0.1/conformance/arrival-readiness/producers/housekeeping.json
curl -O https://hos-ai.vercel.app/spec/0.1/conformance/arrival-readiness/producers/messaging.json
hos replay events.jsonl -m pms.json -m housekeeping.json -m messaging.json
```

```text
 9  non_authoritative      unit.status_changed · pms-000455 · urn:hos:pms:demo
10  applied                guest.message.received · msg-000977 · urn:hos:messaging:demo
    stay_1042: expected, unit unit_204, readiness not_ready, situation at risk
    ▲ at risk: stay_1042 in unit unit_204, expected 2026-07-30T10:30:00Z, planned 2026-07-30T13:00:00Z
11  superseded             guest.message.received · msg-000971 · urn:hos:messaging:demo
12  applied                unit.status_changed · hk-002301 · urn:hos:housekeeping:demo
    stay_1042: expected, unit unit_204, readiness ready, situation resolved
    ▼ resolved: stay_1042, unit_ready
```

Each line is a delivery and what a consumer does with it: apply it, or discard it as a duplicate, superseded by a later fact, from a system that is not the authority, or undeclared by its producer. At delivery 10 the guest announces a 10:30 arrival while unit 204 is still dirty, so the arrival is at risk. At delivery 12 housekeeping reports the unit clean, and the risk is resolved.

The dispositions are what HOS Events 0.1 requires. The readiness and the situations come from the reference projection, which is non-normative: an implementation may read arrivals differently.

### 4. Test your implementation

`hos conformance run` replays the scenarios through a program you write, in any language. The program reads a scenario on its standard input and answers one line per delivery on its standard output, as [the protocol](https://hos-ai.vercel.app/spec/0.1/conformance/PROTOCOL.md) describes. Try it with the Python example, which needs Python 3.11 or later:

```sh
curl -O https://raw.githubusercontent.com/francoisnoel62/HOS-AI/master/examples/python-dispositions/impl.py
hos conformance run --all --level normative --impl "python3 impl.py"
```

```text
✓ arrival-readiness: normative 13/13
✓ late-checkout: normative 15/15
✓ room-out-of-order: normative 14/14

3 scenarios: 3 passed, 0 failed · level normative · protocol hos-conformance/1
```

On Windows, write `--impl "py impl.py"`.

`--level normative` compares the dispositions only. The default level, `reference`, also compares each stay's readiness and situations with the reference projection. When an answer differs, the report names the delivery, the field, the expected value and the one received. In a CI, `--json` prints the results as JSON and `--junit report.xml` also writes a JUnit report.

## Commands

| Command                                        | What it does                                                                                  |
| :--------------------------------------------- | :-------------------------------------------------------------------------------------------- |
| `hos validate <file...>`                       | validates events, manifests and situations (`.json`), and event streams (`.jsonl`)            |
| `hos validate <stream.jsonl> -m <manifest>...` | also checks that each event is declared by its producer's manifest                            |
| `hos replay <stream.jsonl> -m <manifest>...`   | replays a stream through the reference projection, delivery by delivery                       |
| `hos conformance list`                         | lists the conformance scenarios                                                               |
| `hos conformance run --all --impl <command>`   | runs the scenarios through an implementation, in any language                                 |
| `hos conformance producer --manifest --stream` | checks a producer's recorded facts against its manifest, and a redelivery with `--redelivery` |
| `hos manifest keygen`, `sign`, `verify`        | signs a producer manifest and verifies one, from files or from its URL                        |

`hos <command> --help` lists the options of a command. `hos validate` and `hos replay` read standard input when the file is `-`.

### Exit codes

| Code | Meaning                                                           |
| :--- | :---------------------------------------------------------------- |
| 0    | everything is valid, or every check passed                        |
| 1    | a file is invalid, a check failed, or a signature does not verify |
| 2    | the command is wrong, or a file or URL could not be read          |

## Sign a producer manifest

A producer's manifest declares the facts it sends and which system is the authority for each. HOS Events 0.1 has the producer sign it, so a consumer can check who declared what, and that nobody changed it since:

```sh
hos manifest keygen --key private-key.json --jwks jwks.json
hos manifest sign manifest.json --key private-key.json
hos manifest verify manifest.json --jwks jwks.json
```

`sign` writes `manifest.jws`, valid 90 days by default (`--days`); sign again before it expires. A public producer serves `manifest.json`, `manifest.jws` and `jwks.json` under `/.well-known/hos/` on its HTTPS origin, and a private one gives them to its consumers through configured, authenticated URLs. A public manifest can be verified from its URL:

```sh
hos manifest verify https://example.com/.well-known/hos/manifest.json
```

To rotate keys, run `keygen` again with the same `--jwks`: it adds the new key to the set. Keep the old key in the set until every manifest signed with it has expired.

Keep `private-key.json` secret, and out of version control: whoever holds it can sign as your producer.

## On Windows

- If PowerShell refuses to run `npx` or `npm` because of its execution policy, type `npx.cmd` and `npm.cmd`.
- `python3` often does not exist on Windows. Use the Python launcher, `py`, or `python`.
- In Windows PowerShell 5.1, `curl` is another command. Type `curl.exe`.
- `--impl` runs through `cmd.exe`: quote paths with double quotes, not single quotes.
- `keygen` asks the system to make the private key readable by you alone, which Windows does not enforce. Store it somewhere only you can read.

## Problems and questions

[Open an issue](https://github.com/francoisnoel62/HOS-AI/issues/new/choose) with the template for the CLI and the SDK. Give the output of `hos --version` and `node --version`, your system, the exact command and its output, with `--json` where the command has it. Use synthetic data only: never real guest data, credentials or private keys.

## Links

- [HOS 0.1 documentation](https://hos-ai.vercel.app/docs): HOS Core, HOS Events and their schemas
- [Conformance protocol](https://hos-ai.vercel.app/spec/0.1/conformance/PROTOCOL.md), for implementations in any language
- [@hos-ai/sdk](https://www.npmjs.com/package/@hos-ai/sdk): the same checks as a TypeScript library
- [Changelog](https://github.com/francoisnoel62/HOS-AI/blob/master/packages/cli/CHANGELOG.md) and [source](https://github.com/francoisnoel62/HOS-AI/tree/master/packages/cli)

## License

[Apache-2.0](https://github.com/francoisnoel62/HOS-AI/blob/master/packages/cli/LICENSE), like the HOS schemas and conformance scenarios the package carries. The text of the specification is published under CC BY 4.0 on the HOS website and is not part of this package.
