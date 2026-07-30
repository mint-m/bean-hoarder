-- 2026-07-08: 로스터리 로고 서버 저장 (기기 간 재사용)
CREATE TABLE IF NOT EXISTS logos (
  usercode   TEXT NOT NULL REFERENCES users(usercode),
  roastery   TEXT NOT NULL,
  data_url   TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (usercode, roastery)
);
