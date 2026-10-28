PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  capability_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schedules (
  schedule_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  workspace_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  label TEXT NOT NULL,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  asset TEXT NOT NULL,
  token_contract TEXT,
  amount TEXT NOT NULL,
  cadence TEXT NOT NULL,
  timezone TEXT NOT NULL,
  start_epoch_ms INTEGER NOT NULL,
  start_local TEXT NOT NULL,
  anchor_day INTEGER NOT NULL,
  end_epoch_ms INTEGER,
  occurrence_limit INTEGER,
  last_scanned_ms INTEGER NOT NULL,
  next_due_ms INTEGER,
  created_at TEXT NOT NULL,
  PRIMARY KEY(schedule_id, revision),
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);
CREATE INDEX IF NOT EXISTS idx_schedules_active ON schedules(active, next_due_ms);
CREATE INDEX IF NOT EXISTS idx_schedules_workspace ON schedules(workspace_id, schedule_id, revision DESC);
CREATE TABLE IF NOT EXISTS occurrences (
  id TEXT PRIMARY KEY,
  occurrence_key TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL,
  schedule_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  occurrence_index INTEGER NOT NULL,
  scheduled_at_ms INTEGER NOT NULL,
  scheduled_local TEXT NOT NULL,
  timezone TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  validated_at TEXT,
  prepared_at TEXT,
  state TEXT NOT NULL,
  group_name TEXT NOT NULL,
  provenance TEXT NOT NULL,
  terms_json TEXT NOT NULL,
  validation_json TEXT,
  review_json TEXT,
  unsigned_json TEXT,
  transaction_hash TEXT UNIQUE,
  reconciliation_json TEXT,
  failure_reason TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);
CREATE INDEX IF NOT EXISTS idx_occurrences_workspace ON occurrences(workspace_id, scheduled_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_occurrences_state ON occurrences(state, scheduled_at_ms);
CREATE TABLE IF NOT EXISTS scheduler_state (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  heartbeat_at TEXT NOT NULL,
  invocation_id TEXT NOT NULL,
  source TEXT NOT NULL,
  schedules_scanned INTEGER NOT NULL,
  occurrences_created INTEGER NOT NULL,
  duplicates_ignored INTEGER NOT NULL
);
