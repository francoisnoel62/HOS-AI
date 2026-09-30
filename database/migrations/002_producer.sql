-- The persistent reference producer of the pilot (FO-02 of FINISH-OBSERVE), apart from the forms tables: the crosswalk,
-- the adapter's state and the journal of the HOS facts of each producer. A producer is one source system publishing for
-- one tenant. HOS itself requires no such storage.
CREATE SCHEMA IF NOT EXISTS hos_producer;

-- One row per producer: the adapter's state, and the row each delivery locks, so the deliveries of one producer are
-- written one after the other.
CREATE TABLE IF NOT EXISTS hos_producer.producers (
  tenant TEXT NOT NULL,
  source TEXT NOT NULL,
  adapter_state JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant, source)
);

-- The crosswalk: the opaque HOS id given to each entity of the source system, never changed afterwards.
CREATE TABLE IF NOT EXISTS hos_producer.identities (
  tenant TEXT NOT NULL,
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  hos_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant, source, kind, source_id),
  UNIQUE (tenant, source, hos_id),
  FOREIGN KEY (tenant, source) REFERENCES hos_producer.producers (tenant, source)
);

-- The journal: each HOS fact once, in the order it was written, as the JSON text it was first written with. Text rather
-- than JSONB, which would reorder its keys: a redelivered fact must keep its exact content.
CREATE TABLE IF NOT EXISTS hos_producer.journal (
  seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant TEXT NOT NULL,
  source TEXT NOT NULL,
  id TEXT NOT NULL,
  fact TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant, source, id),
  FOREIGN KEY (tenant, source) REFERENCES hos_producer.producers (tenant, source)
);

CREATE INDEX IF NOT EXISTS journal_producer_seq_idx ON hos_producer.journal (tenant, source, seq);
