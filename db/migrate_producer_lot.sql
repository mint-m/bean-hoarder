-- 비파괴 마이그레이션: 생산자/농장, 랏·워싱스테이션 컬럼 추가
ALTER TABLE beans ADD COLUMN producer TEXT DEFAULT '';
ALTER TABLE beans ADD COLUMN lot TEXT DEFAULT '';
