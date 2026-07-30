-- 비파괴 마이그레이션: 기존 users/beans 데이터를 보존한 채 신규 컬럼만 추가.
-- recovery_hash는 기존 계정엔 NULL로 남는다 (그 계정들은 복구키를 새로 발급받아야 함).
ALTER TABLE users ADD COLUMN recovery_hash TEXT;
ALTER TABLE beans ADD COLUMN memo TEXT DEFAULT '';
