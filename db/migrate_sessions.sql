-- Phase 2 인증 업그레이드: 세션 토큰 + 인증 시도 rate limit.
-- 세션 토큰(bhs_ 접두 고엔트로피)은 SHA-256 해시만 저장. 만료 90일 고정.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  usercode   TEXT NOT NULL REFERENCES users(usercode),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(usercode);

-- 고정 윈도우 실패 카운터 — bucket 예: pw:{유저코드} / ip:{IP} / signup:{IP} / recover:{IP}
CREATE TABLE IF NOT EXISTS auth_attempts (
  bucket   TEXT PRIMARY KEY,
  count    INTEGER NOT NULL DEFAULT 0,
  reset_at TEXT NOT NULL
);
