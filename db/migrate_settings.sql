-- 서비스 설정 key/value (#88) — 첫 키는 signup_mode: invite | open | closed.
-- 관리자 페이지가 읽고 쓴다. 행이 없으면 코드는 invite(기존 동작)로 본다.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ai_usage 정리 (#71) — 키에 날짜가 들어 있던 옛 행. 새 코드는 `acct:{유저코드}` / `global`만 쓴다.
DELETE FROM ai_usage WHERE bucket LIKE 'acct:%:%' OR bucket LIKE 'global:%';
