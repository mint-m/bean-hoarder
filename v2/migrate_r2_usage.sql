-- Phase 4: R2 비용 백스톱 — 서비스 전역 월간 R2 쓰기(Class A) 카운터.
-- putLogo가 매 저장 전에 이 카운터로 월간 쓰기 예산 초과를 판정하고, 초과 시 503으로 거부한다.
-- Cloudflare R2는 자동 지출 상한을 제공하지 않으므로(대시보드 예산 알림은 알림뿐) 코드에서
-- R2 쓰기를 거부하는 것이 요금을 물리적으로 막는 유일한 방법이다. 스토리지 상한은 별도 테이블
-- 없이 R2 백드 logos 행 수로 강제한다(packages/api/src/lib/budget.ts).
CREATE TABLE IF NOT EXISTS r2_usage (
  id          TEXT PRIMARY KEY,       -- 'global'
  month       TEXT NOT NULL,          -- 현재 집계 월 'YYYY-MM'
  write_count INTEGER NOT NULL DEFAULT 0
);
