# HOS dispositions in Python

A HOS Events 0.1 consumer in about 130 lines of Python, with nothing but the standard library. For every delivery it decides what a consumer does with the fact, which the specification requires of every implementation:

- **duplicate** when the same source and id arrived before;
- **undeclared_capability** when the producer's manifest does not declare the fact for the property, or does not allow it as a snapshot;
- **non_authoritative** when the producer is declared but is not the system of record for that fact;
- **superseded** when a later fact about the same thing already arrived: the later occurrence wins, by time, then source, then id;
- **applied** otherwise.

It does not implement the arrival-readiness reference projection, which is non-normative. It is conformant at the normative level of the `hos-conformance/1` protocol, which `public/spec/0.1/conformance/PROTOCOL.md` describes.

## Run it

With Python 3.11 or later and Node 22 or later:

```sh
npx @hos-ai/cli conformance run --all --level normative --impl "python3 impl.py"
```

On Windows, where `python3` often does not exist, write `--impl "py impl.py"`.

```text
✓ arrival-readiness: normative 13/13
✓ late-checkout: normative 15/15
✓ room-out-of-order: normative 14/14

3 scenarios: 3 passed, 0 failed · level normative · protocol hos-conformance/1
```

The tool writes each scenario to the program's standard input and reads one line per delivery from its standard output. Try breaking a rule, for example removing the `duplicate` check, and run it again: the report names the delivery, the expected disposition and the one received.
