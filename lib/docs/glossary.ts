// The glossary of the tools documentation. The glossary page lists these terms, and <Term id="…"> shows a definition
// where a page first uses the term. Plain language first; the pages carry the detail.

export type GlossaryEntry = { id: string; term: string; definition: string };

export const glossary: GlossaryEntry[] = [
  {
    id: "adapter",
    term: "Adapter",
    definition:
      "The code that turns what a hotel system knows, such as a PMS's webhooks, into HOS facts. It makes the system a producer, without changing the system itself.",
  },
  {
    id: "authority",
    term: "Authority",
    definition:
      "The system of record for a value, such as the housekeeping app for a unit's cleaning status. Only the authority changes that value; facts from other systems are recorded and shown as conflicts, never merged into it.",
  },
  {
    id: "business-date",
    term: "Business date",
    definition:
      "The hotel's operating day a fact belongs to, in its own time zone. It can differ from the calendar date of the fact's time: a night audit after midnight still belongs to the day before.",
  },
  {
    id: "cloudevents",
    term: "CloudEvents",
    definition:
      "An open format for describing events, which HOS events follow: a few standard attributes, such as source, id, type and time, around the event's data. HOS adds its own attributes, which start with hos.",
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
    id: "crosswalk",
    term: "Crosswalk",
    definition:
      "The table an adapter keeps between the ids of a source system and the HOS ids it gave them, such as room 204 and unit_204. It must survive restarts: without it, the same room would get a new HOS id.",
  },
  {
    id: "delivery",
    term: "Delivery",
    definition:
      "One arrival of a fact at a consumer. Because delivery is at least once, the same fact can have several deliveries; a consumer keeps the first and discards the others as duplicates.",
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
    id: "junit",
    term: "JUnit report",
    definition:
      "An XML file of test results that most CI tools can display. hos conformance run writes one with --junit: one test suite per scenario, one test case per delivery.",
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
    id: "kid",
    term: "Key id (kid)",
    definition:
      "The name of a key in a key set. A signature names the key that made it by its kid, so a consumer finds the right public key. hos uses the key's fingerprint by default.",
  },
  {
    id: "pms",
    term: "PMS",
    definition:
      "Property management system: the hotel's main software for reservations, stays, rooms and billing, such as Mews, Apaleo or Cloudbeds.",
  },
  {
    id: "normative",
    term: "Normative and reference levels",
    definition:
      "The two levels of a conformance run. Normative compares the dispositions, which the HOS Events rules decide: every conformant consumer reaches them. Reference also compares arrival readiness and situations with the reference projection, which is not normative.",
  },
  {
    id: "private-key",
    term: "Private key",
    definition:
      "The secret half of a signing key. Whoever holds it can sign as the producer, so it is never published or committed, and is replaced at once if it leaks.",
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
    id: "property",
    term: "Property",
    definition: "A hotel, in HOS terms: the operating context of a fact, with its own time zone and business date. A property belongs to one tenant.",
  },
  {
    id: "redelivery",
    term: "Redelivery",
    definition:
      "What a producer publishes again from the same source data, for example after a restart. It must bring back the same facts, with the same ids and content, so that consumers discard them as duplicates.",
  },
  {
    id: "situation",
    term: "Situation",
    definition:
      "An alert a consumer raises from the facts, such as an arrival at risk because its room is not ready. HOS defines two reference situations, raised and resolved, as an example of what the facts make possible.",
  },
  {
    id: "signature",
    term: "Signature",
    definition:
      "manifest.jws, made with the producer's private key. It proves who declared the manifest and that nobody changed it since. It expires, 90 days after signing by default with hos, so the producer signs again before then.",
  },
  {
    id: "snapshot",
    term: "Snapshot",
    definition:
      "An event that restates a whole state, such as every status of a unit, rather than one change. It is marked as a snapshot, classified for sensitivity, and declared in the producer's manifest; it serves to recover a state that changes could not.",
  },
  {
    id: "source",
    term: "Source",
    definition:
      "The attribute of a fact that names the producer that published it, such as urn:hos:pms:demo. With the fact's id, it identifies the fact.",
  },
  {
    id: "stream",
    term: "Stream (JSON Lines)",
    definition: "A file of facts, one JSON object per line, usually named .jsonl, in the order they were delivered.",
  },
  {
    id: "tenant",
    term: "Tenant",
    definition:
      "The organisation the data belongs to, such as a hotel group, and the boundary of its security and policies. Every property belongs to one tenant.",
  },
];

export const findGlossaryEntry = (id: string) => glossary.find((entry) => entry.id === id);
