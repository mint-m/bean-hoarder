-- 데모 관리자 세션 철회 — sessions.admin 컬럼을 되돌린다.
-- DEMO가 공개 계정이라 쓰기를 막고, 그 예외로 관리자 키를 뒀던 구조 자체가 없어졌다.
-- 이제 DEMO는 평범한 개인 계정이고 구경은 정적 데모 페이지(/demo)가 맡는다.
ALTER TABLE sessions DROP COLUMN admin;
