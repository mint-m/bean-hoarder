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
  producer     TEXT DEFAULT '',
  lot          TEXT DEFAULT '',
  washing_station TEXT DEFAULT '',
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
  archived     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_beans_user ON beans(usercode);

-- 로스터리별 로고 (기기 간 재사용). roastery는 대문자 정규화 저장, data_url ≤ 100KB.
CREATE TABLE IF NOT EXISTS logos (
  usercode   TEXT NOT NULL REFERENCES users(usercode),
  roastery   TEXT NOT NULL,
  data_url   TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (usercode, roastery)
);
