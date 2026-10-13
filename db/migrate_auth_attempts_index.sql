-- auth_attempts.reset_at에 인덱스를 추가한다(#92 리뷰에서 나온 결함).
-- ratelimit.ts의 recordFailure가 실패마다 `DELETE FROM auth_attempts WHERE reset_at <= now()`를
-- 돌리는데, PRIMARY KEY(bucket)만으로는 이 WHERE가 매번 테이블 전체를 훑는다 — 브루트포스처럼
-- 실패가 몰리는 바로 그 상황에서 청소 비용이 테이블 크기만큼 커지는 역설이 생긴다. 인덱스가 있으면
-- 이 DELETE가 만료된 행만 찾아가 지우므로, 공격이 길어져도 한 번의 비용이 커지지 않는다.
CREATE INDEX IF NOT EXISTS idx_auth_attempts_reset_at ON auth_attempts(reset_at);
