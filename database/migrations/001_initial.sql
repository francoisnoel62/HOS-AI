CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('founding_member', 'pilot', 'technical_contributor', 'financial_patron', 'general_inquiry')),
  status TEXT NOT NULL CHECK (status IN ('received', 'under_review', 'contacted', 'closed')),
  payload TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  country TEXT,
  privacy_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  last_contact_at TIMESTAMPTZ,
  retention_due_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS submission_events (
  id UUID PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'status_changed', 'delivery_failed', 'deleted')),
  actor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS abuse_keys (
  hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('rate_limit', 'investigation')),
  count INTEGER NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (hash, purpose)
);

CREATE INDEX IF NOT EXISTS submissions_retention_due_at_idx ON submissions(retention_due_at);
CREATE INDEX IF NOT EXISTS submission_events_submission_id_idx ON submission_events(submission_id);
CREATE INDEX IF NOT EXISTS abuse_keys_expires_at_idx ON abuse_keys(expires_at);
