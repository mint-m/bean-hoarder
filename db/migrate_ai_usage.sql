-- AI 인식 사용량 카운터 — 서비스 키로 대신 호출해 주는 몫에만 상한을 건다.
-- 사용자가 본인 키를 넣으면 브라우저에서 Google로 직접 가므로 여기 세지 않는다(제한도 없다).
--
-- bucket 형식:
--   'acct:{유저코드}:{YYYY-MM-DD}'  계정별 하루 한도
--   'global:{YYYY-MM-DD}'           서비스 전역 하루 한도 (한 사람이 하루치를 독식하지 못하게)
-- auth_attempts와 같은 모양이지만 성격이 달라 테이블을 나눈다 — 인증 rate limit이 이 행을
-- 지우거나 리셋하는 일에 휘말리면 안 된다.
CREATE TABLE IF NOT EXISTS ai_usage (
  bucket   TEXT PRIMARY KEY,
  count    INTEGER NOT NULL DEFAULT 0,
  reset_at TEXT NOT NULL
);
