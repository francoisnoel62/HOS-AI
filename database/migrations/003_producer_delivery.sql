-- Delivery from the pilot's reference producer (FO-02 of FINISH-OBSERVE): the position of each consumer in a producer's
-- journal, and how far retention has purged that journal.

-- Retention deletes the journal from its start: every fact at or before purged_through is gone.
ALTER TABLE hos_producer.producers ADD COLUMN IF NOT EXISTS purged_through BIGINT NOT NULL DEFAULT 0;

-- The position of the last fact each consumer has processed. It only moves forward.
CREATE TABLE IF NOT EXISTS hos_producer.cursors (
  tenant TEXT NOT NULL,
  source TEXT NOT NULL,
  consumer TEXT NOT NULL,
  seq BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant, source, consumer),
  FOREIGN KEY (tenant, source) REFERENCES hos_producer.producers (tenant, source)
);

CREATE INDEX IF NOT EXISTS journal_producer_recorded_at_idx ON hos_producer.journal (tenant, source, recorded_at);
