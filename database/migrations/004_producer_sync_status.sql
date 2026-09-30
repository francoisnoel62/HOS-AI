-- The synchronisation status of the pilot's reference producer (FO-02 of FINISH-OBSERVE), per property and per source:
-- when the poller started, when it last tried, when it last succeeded, and its last error. A consumer reads it to know
-- whether the facts it holds may be out of date.
CREATE TABLE IF NOT EXISTS hos_producer.sync_status (
  tenant TEXT NOT NULL,
  source TEXT NOT NULL,
  property_id TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  -- When the last successful poll began to read the source: its facts are as recent as that, not as its end.
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant, source, property_id),
  FOREIGN KEY (tenant, source) REFERENCES hos_producer.producers (tenant, source)
);
