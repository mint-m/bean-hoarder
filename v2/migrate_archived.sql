-- 비파괴 마이그레이션: 소비 완료 등으로 숨김 처리하는 보관(archived) 상태 컬럼 추가
ALTER TABLE beans ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
