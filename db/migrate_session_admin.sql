-- 데모 관리자 세션: 세션에 admin 플래그를 둔다.
-- 공개된 DEMO/0000 로그인은 계속 admin=0(둘러보기 전용)이고, 로그인 시 DEMO_ADMIN_KEY를 함께
-- 제시한 세션만 admin=1로 발급돼 쓰기가 열린다 — packages/api/src/routes/auth.ts 참고.
ALTER TABLE sessions ADD COLUMN admin INTEGER NOT NULL DEFAULT 0;
