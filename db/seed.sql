-- 로컬·e2e 픽스처 — e2e 계정 하나와 조회 테스트용 원두 한 건.
-- pass_hash는 구형(SHA-256) 포맷 — 첫 로그인 시 서버가 PBKDF2로 자동 업그레이드한다.
--
-- ⚠️ **원격 D1에 실행하지 말 것.** 암호가 저장소에 적혀 있어, 원격에 넣으면 누구나 로그인하는
--    계정이 라이브에 생긴다. 서비스에 특별 취급되는 계정은 없다.
--
-- 데모는 여기 없다 — /demo 덱도 데모 카드도 apps/web/src/demo-beans.json으로 만드는 정적
-- 페이지라 D1을 전혀 타지 않는다. 저작용 계정도 두지 않는다: 데모 콘텐츠가 사는 곳은
-- 그 JSON 한 곳뿐이고, 형식 검증은 apps/web/src/demo-beans.test.ts가 맡는다.

-- e2e 전용 계정(유저코드 TEST, 암호 0000) — 쓰기 제한이 없어 등록 동선을 끝까지 검증한다.
INSERT OR IGNORE INTO users (usercode, pass_hash, recovery_hash) VALUES
  ('TEST', '37d315b6d9de4369664a0f20c49a8d7b56703fc74245b5b83588fbe2ac6c98c6',
   'f3694ec983ba1134bb1b67d54b97924ea67642bd4bd0cd154993b41cfa6ed84a');

-- 공개 조회(/{KEY}) 동선이 D1을 실제로 거치는지 확인하기 위한 고정 원두.
-- 데모 카드는 정적 경로라 이 검증을 대신해 주지 못한다 — 그래서 API로 답하는 행이 따로 필요하다.
INSERT OR REPLACE INTO beans (key, usercode, roastery, origin, region, variety, process,
  altitude, roast_date, package_date, net_weight, agtron, tasting_note) VALUES
  ('TEST26-001', 'TEST', 'E2E FIXTURE', 'ETHIOPIA', 'Yirgacheffe', 'Heirloom', 'Washed',
   '2000m', '26.06.28', '26.07.03', '60g', '#95 (라이트)', 'Jasmine, bergamot');
