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
  coffee_name  TEXT DEFAULT '',
  archived     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_beans_user ON beans(usercode);

-- 로스터리별 로고 (기기 간 재사용). roastery는 대문자 정규화 저장, data_url ≤ 100KB.
CREATE TABLE IF NOT EXISTS logos (
  usercode     TEXT NOT NULL REFERENCES users(usercode),
  roastery     TEXT NOT NULL,
  data_url     TEXT NOT NULL,          -- 레거시 인라인 저장 (R2 이전 후 신규 행은 '')
  content_type TEXT NOT NULL DEFAULT '', -- R2 저장 로고의 MIME 타입 (비어 있으면 data_url 사용)
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (usercode, roastery)
);

-- 세션 토큰 (Phase 2 인증) — 토큰은 SHA-256 해시만 저장, 만료 90일
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  usercode   TEXT NOT NULL REFERENCES users(usercode),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(usercode);

-- 인증 시도 rate limit용 고정 윈도우 실패 카운터
CREATE TABLE IF NOT EXISTS auth_attempts (
  bucket   TEXT PRIMARY KEY,
  count    INTEGER NOT NULL DEFAULT 0,
  reset_at TEXT NOT NULL
);

-- R2 비용 백스톱 — 서비스 전역 월간 R2 쓰기(Class A) 카운터. 단일 행(id='global').
-- 월이 바뀌면 write_count 리셋, 임계값 초과 시 로고 쓰기를 거부해 요금 폭탄을 물리적으로 막는다.
-- (스토리지 상한은 별도 테이블 없이 R2 백드 logos 행 수로 강제 — packages/api/src/lib/budget.ts)
CREATE TABLE IF NOT EXISTS r2_usage (
  id          TEXT PRIMARY KEY,       -- 'global'
  month       TEXT NOT NULL,          -- 현재 집계 월 'YYYY-MM'
  write_count INTEGER NOT NULL DEFAULT 0
);

-- AI 인식 사용량 카운터 — 서비스 키로 대신 호출해 주는 몫에만 상한을 건다(계정별·전역 하루 한도).
-- 사용자가 본인 키를 넣으면 브라우저에서 Google로 직접 가므로 세지 않는다. bucket 형식은
-- 'acct:{유저코드}:{YYYY-MM-DD}' / 'global:{YYYY-MM-DD}' — 자세한 근거는 db/migrate_ai_usage.sql.
CREATE TABLE IF NOT EXISTS ai_usage (
  bucket   TEXT PRIMARY KEY,
  count    INTEGER NOT NULL DEFAULT 0,
  reset_at TEXT NOT NULL
);
