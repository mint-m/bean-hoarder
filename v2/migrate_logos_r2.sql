-- Phase 3: 로고 저장을 D1 data URL → R2 오브젝트로 이전.
-- 새로 저장·교체되는 로고는 R2(bnhd-logos 버킷, 키 {usercode}/{roastery})에 바이트로 저장하고
-- D1 행은 메타데이터(content_type)만 유지한다(data_url = ''). 기존 행의 data URL은 그대로
-- 서빙되며, 사용자가 로고를 재저장하는 시점에 자연히 R2로 이전된다(lazy migration).
ALTER TABLE logos ADD COLUMN content_type TEXT NOT NULL DEFAULT '';
