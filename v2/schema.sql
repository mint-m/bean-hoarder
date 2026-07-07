CREATE TABLE IF NOT EXISTS users (
  usercode      TEXT PRIMARY KEY,
  pass_hash     TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS beans (
  key          TEXT PRIMARY KEY,
  usercode     TEXT NOT NULL REFERENCES users(usercode),
  roastery     TEXT NOT NULL,
  origin       TEXT DEFAULT '',
  region       TEXT DEFAULT '',
  variety      TEXT DEFAULT '',
  process      TEXT DEFAULT '',
  altitude     TEXT DEFAULT '',
  harvest      TEXT DEFAULT '',
  roast_date   TEXT DEFAULT '',
  package_date TEXT DEFAULT '',
  net_weight   TEXT DEFAULT '',
  agtron       TEXT DEFAULT '',
  tasting_note TEXT DEFAULT '',
  memo         TEXT DEFAULT '',
  source_url   TEXT DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_beans_user ON beans(usercode);
