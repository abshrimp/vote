-- Canonical schema for a NEW, empty Turso database. No migration or compatibility tables.
CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY,
  public_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  max_votes INTEGER NOT NULL DEFAULT 1 CHECK (max_votes BETWEEN 1 AND 20),
  name_font_size INTEGER NOT NULL DEFAULT 16 CHECK (name_font_size BETWEEN 10 AND 36),
  columns_json TEXT NOT NULL DEFAULT '[]',
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  CHECK (ends_at > starts_at)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS candidates (
  poll_id TEXT NOT NULL REFERENCES polls(id),
  id TEXT NOT NULL,
  public_id TEXT,
  name TEXT NOT NULL,
  extra_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (poll_id, id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS candidates_order ON candidates(poll_id,sort_order,id);

-- One record per selection; condition-only records do not affect official tallies.
CREATE TABLE IF NOT EXISTS votes (
  poll_id TEXT NOT NULL,
  voter_hash TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  ip_hash TEXT,
  fingerprint_hash TEXT,
  is_official INTEGER NOT NULL DEFAULT 1 CHECK(is_official IN (0,1)),
  signal_match INTEGER NOT NULL DEFAULT 0 CHECK(signal_match IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(poll_id,voter_hash,candidate_id),
  FOREIGN KEY(poll_id,candidate_id) REFERENCES candidates(poll_id,id),
  CHECK(is_official=1 OR signal_match=1)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS votes_voter ON votes(voter_hash,poll_id,candidate_id,is_official);
CREATE INDEX IF NOT EXISTS votes_signal_match
  ON votes(poll_id,ip_hash,fingerprint_hash,voter_hash) WHERE is_official=1;
CREATE INDEX IF NOT EXISTS votes_flagged ON votes(poll_id) WHERE signal_match=1;

-- One counter per candidate with official votes, updated atomically by triggers.
CREATE TABLE IF NOT EXISTS candidate_totals (
  poll_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  total INTEGER NOT NULL CHECK(total>=0),
  PRIMARY KEY(poll_id,candidate_id),
  FOREIGN KEY(poll_id,candidate_id) REFERENCES candidates(poll_id,id) ON DELETE CASCADE
) WITHOUT ROWID;
CREATE TRIGGER IF NOT EXISTS votes_total_insert AFTER INSERT ON votes
WHEN NEW.is_official=1
BEGIN
  INSERT INTO candidate_totals(poll_id,candidate_id,total) VALUES(NEW.poll_id,NEW.candidate_id,1)
  ON CONFLICT(poll_id,candidate_id) DO UPDATE SET total=total+1;
END;
CREATE TRIGGER IF NOT EXISTS votes_total_delete AFTER DELETE ON votes
WHEN OLD.is_official=1
BEGIN
  UPDATE candidate_totals SET total=total-1
    WHERE poll_id=OLD.poll_id AND candidate_id=OLD.candidate_id;
  DELETE FROM candidate_totals WHERE poll_id=OLD.poll_id AND candidate_id=OLD.candidate_id AND total=0;
END;

-- Bucket-first key supports efficient range cleanup of expired rate-limit entries.
CREATE TABLE IF NOT EXISTS vote_request_limits (
  bucket INTEGER NOT NULL,
  voter_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK(attempts>=1),
  PRIMARY KEY(bucket,voter_hash)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('claim', 'link', 'notice')),
  config_json TEXT NOT NULL DEFAULT '{}',
  condition_json TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  CHECK (ends_at > starts_at)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS action_claims (
  action_id TEXT NOT NULL REFERENCES actions(id),
  voter_hash TEXT NOT NULL,
  redeemed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (action_id, voter_hash)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS page_blocks (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('heading','text','poll','action')),
  reference_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 1 CHECK(is_published IN (0,1)),
  CHECK (
    (kind IN ('heading','text') AND reference_id IS NULL)
    OR
    (kind IN ('poll','action') AND reference_id IS NOT NULL)
  )
) WITHOUT ROWID;
CREATE UNIQUE INDEX IF NOT EXISTS page_blocks_reference_unique
  ON page_blocks(kind,reference_id)
  WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS page_blocks_order
  ON page_blocks(sort_order,id);

-- Form-wide settings edited in the admin editor (e.g. the theme colour).
CREATE TABLE IF NOT EXISTS form_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

-- Supports all of a visitor's claim state in one seek, rather than a table scan.
CREATE INDEX IF NOT EXISTS action_claims_voter ON action_claims(voter_hash, action_id);

-- One atomic counter update per successful redemption; admin reads one row per action.
CREATE TABLE IF NOT EXISTS action_totals (
  action_id TEXT PRIMARY KEY REFERENCES actions(id) ON DELETE CASCADE,
  total INTEGER NOT NULL CHECK(total>=0)
) WITHOUT ROWID;
CREATE TRIGGER IF NOT EXISTS action_claims_total_insert AFTER INSERT ON action_claims
BEGIN
  INSERT INTO action_totals(action_id,total) VALUES(NEW.action_id,1)
  ON CONFLICT(action_id) DO UPDATE SET total=total+1;
END;
CREATE TRIGGER IF NOT EXISTS action_claims_total_delete AFTER DELETE ON action_claims
BEGIN
  UPDATE action_totals SET total=total-1 WHERE action_id=OLD.action_id;
  DELETE FROM action_totals WHERE action_id=OLD.action_id AND total=0;
END;

-- Public ID uniqueness and cross-reference protection.
CREATE UNIQUE INDEX IF NOT EXISTS polls_public_id_unique ON polls(public_id) WHERE public_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS candidates_public_id_poll_unique ON candidates(poll_id,public_id) WHERE public_id IS NOT NULL;
CREATE TRIGGER IF NOT EXISTS polls_public_id_insert BEFORE INSERT ON polls WHEN ((NEW.public_id IS NOT NULL AND (EXISTS(SELECT 1 FROM polls WHERE public_id=NEW.public_id OR id=NEW.public_id) OR EXISTS(SELECT 1 FROM candidates WHERE public_id=NEW.public_id OR id=NEW.public_id))) OR EXISTS(SELECT 1 FROM polls WHERE public_id=NEW.id) OR EXISTS(SELECT 1 FROM candidates WHERE public_id=NEW.id))
BEGIN
  SELECT RAISE(ABORT, 'Public ID conflict');
END;
CREATE TRIGGER IF NOT EXISTS polls_public_id_update BEFORE UPDATE OF public_id ON polls WHEN (NEW.public_id IS NOT NULL AND (NEW.public_id=NEW.id OR EXISTS(SELECT 1 FROM polls WHERE id<>OLD.id AND (public_id=NEW.public_id OR id=NEW.public_id)) OR EXISTS(SELECT 1 FROM candidates WHERE public_id=NEW.public_id OR id=NEW.public_id)))
BEGIN
  SELECT RAISE(ABORT, 'Public ID conflict');
END;
CREATE TRIGGER IF NOT EXISTS candidates_public_id_insert BEFORE INSERT ON candidates WHEN ((NEW.public_id IS NOT NULL AND (EXISTS(SELECT 1 FROM polls WHERE public_id=NEW.public_id OR id=NEW.public_id) OR EXISTS(SELECT 1 FROM candidates WHERE id=NEW.public_id OR (poll_id=NEW.poll_id AND public_id=NEW.public_id)))) OR EXISTS(SELECT 1 FROM polls WHERE public_id=NEW.id) OR EXISTS(SELECT 1 FROM candidates WHERE public_id=NEW.id))
BEGIN
  SELECT RAISE(ABORT, 'Public ID conflict');
END;
CREATE TRIGGER IF NOT EXISTS candidates_public_id_update BEFORE UPDATE OF public_id ON candidates WHEN (NEW.public_id IS NOT NULL AND (NEW.public_id=NEW.id OR EXISTS(SELECT 1 FROM polls WHERE public_id=NEW.public_id OR id=NEW.public_id) OR EXISTS(SELECT 1 FROM candidates WHERE id=NEW.public_id OR (poll_id=OLD.poll_id AND id<>OLD.id AND public_id=NEW.public_id))))
BEGIN
  SELECT RAISE(ABORT, 'Public ID conflict');
END;
