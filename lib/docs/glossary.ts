// The glossary of the tools documentation. The glossary page lists these terms, and <Term id="…"> shows a definition
// where a page first uses the term. Plain language first; the pages carry the detail.

export type GlossaryEntry = { id: string; term: string; definition: string };

export const glossary: GlossaryEntry[] = [
  {
    id: "authority",
    term: "Authority",
    definition:
      "The system of record for a value, such as the housekeeping app for a unit's cleaning status. Only the authority changes that value; facts from other systems are recorded and shown as conflicts, never merged into it.",
  },
  {
    id: "conformance-scenario",
    term: "Conformance scenario",
    definition:
      "A made-up sequence of deliveries, with the manifests of its producers and the expected outcome. A system replays it and compares its results with the expected ones.",
  },
  {
    id: "consumer",
    term: "Consumer",
    definition: "A system that receives HOS facts and decides what to do with each one.",
  },
  {
    id: "disposition",
    term: "Disposition",
    definition:
      "What a consumer does with a fact it receives: applied, or set aside as a duplicate, superseded by a later fact, non_authoritative when its producer is not the authority, or undeclared_capability when its producer did not declare it.",
  },
  {
    id: "exit-code",
    term: "Exit code",
    definition:
      "The number a command returns when it ends, which scripts and CI read. hos returns 0 when everything is valid or passed, 1 when a file is invalid or a check failed, and 2 when the command is wrong or a file could not be read.",
  },
  {
    id: "fact",
    term: "Fact (event)",
    definition:
      "One thing that happened in a hotel system, such as a unit becoming clean, sent as a CloudEvent in the HOS format. It states what the source knows; it does not ask anyone to do anything.",
  },
  {
    id: "jwks",
    term: "JWKS",
    definition:
      "JSON Web Key Set: the public keys of a producer, published next to its manifest. Consumers use them to check the manifest's signature. The private key that signs stays with the producer.",
  },
  {
    id: "manifest",
    term: "Manifest",
    definition:
      "A producer's declaration: the facts it publishes and for which properties, the values it is the authority for, how it delivers, replays and keeps them, and its known limitations. The producer signs it.",
  },
  {
    id: "normative",
    term: "Normative and reference levels",
    definition:
      "The two levels of a conformance run. Normative compares the dispositions, which the HOS Events rules decide: every conformant consumer reaches them. Reference also compares arrival readiness and situations with the reference projection, which is not normative.",
  },
  {
    id: "producer",
    term: "Producer",
    definition:
      "A system that publishes HOS facts, such as a property management system (PMS) or a housekeeping app. Its manifest says what it publishes.",
  },
  {
    id: "reference-projection",
    term: "Reference projection",
    definition:
      "The way the SDK reads arrival readiness from the facts, to show what HOS makes possible. It is not normative: a consumer can assess arrivals differently and still follow HOS Events 0.1.",
  },
  {
    id: "signature",
    term: "Signature",
    definition:
      "manifest.jws, made with the producer's private key. It proves who declared the manifest and that nobody changed it since. It expires, 90 days after signing by default with hos, so the producer signs again before then.",
  },
  {
    id: "stream",
    term: "Stream (JSON Lines)",
    definition: "A file of facts, one JSON object per line, usually named .jsonl, in the order they were delivered.",
  },
];

export const findGlossaryEntry = (id: string) => glossary.find((entry) => entry.id === id);
