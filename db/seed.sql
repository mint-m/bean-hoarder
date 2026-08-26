-- 로컬·e2e 픽스처 — 계정 둘과 조회 테스트용 원두 한 건.
-- pass_hash는 구형(SHA-256) 포맷 — 첫 로그인 시 서버가 PBKDF2로 자동 업그레이드한다.
--
-- ⚠️ **원격 D1에 실행하지 말 것.** 암호가 저장소에 적혀 있어, 원격에 넣으면 누구나 로그인하는
--    계정이 라이브에 생긴다. 서비스에 특별 취급되는 계정은 없다.
--
-- 구경거리(/demo 덱과 데모 카드)는 여기 없다 — apps/web/src/demo-beans.json으로 만드는 정적
-- 페이지라 D1을 전혀 타지 않는다. 아래 DEMO 계정은 그 JSON을 앱에서 꾸미기 위한 저작용일 뿐이다.

-- e2e 전용 계정(유저코드 TEST, 암호 0000) — 쓰기 제한이 없어 등록 동선을 끝까지 검증한다.
INSERT OR IGNORE INTO users (usercode, pass_hash, recovery_hash) VALUES
  ('TEST', '37d315b6d9de4369664a0f20c49a8d7b56703fc74245b5b83588fbe2ac6c98c6',
   'f3694ec983ba1134bb1b67d54b97924ea67642bd4bd0cd154993b41cfa6ed84a');

-- 데모 저작용 계정(유저코드 DEMO, 암호 0000) — 로컬 랩에서 데모에 실을 원두를 꾸며 보는 자리다.
-- KEY가 유저코드에서 나오므로(DEMO26-001) 데모 KEY를 만들려면 계정 이름이 DEMO여야 하는데,
-- 가입은 유저코드를 무작위 발급하고 그 알파벳에 O가 없어 DEMO는 발급되지 않는다 — 그래서 시드가
-- 미리 놓아 둔다. 여기서 꾸민 뒤 npm run gen:demo-beans로 떠 온다.
-- 서비스는 이 계정을 특별 취급하지 않는다. 데모 페이지도 D1이 아니라 JSON을 읽으므로, 이 계정은
-- 저작 도구일 뿐 구경거리의 출처가 아니다. TEST와 마찬가지로 원격에 넣지 않는다.
INSERT OR IGNORE INTO users (usercode, pass_hash, recovery_hash) VALUES
  ('DEMO', 'ae399e68ab3b10ba60abbb7a9859e53785817f453f13528a2fd85557daf1ce47',
   '0a915ff66685ba15421a8c45464e63172507de5b77851d660451a3215f1f1185');

-- 공개 조회(/{KEY}) 동선이 D1을 실제로 거치는지 확인하기 위한 고정 원두.
-- 데모 카드는 정적 경로라 이 검증을 대신해 주지 못한다 — 그래서 API로 답하는 행이 따로 필요하다.
INSERT OR REPLACE INTO beans (key, usercode, roastery, origin, region, variety, process,
  altitude, roast_date, package_date, net_weight, agtron, tasting_note) VALUES
  ('TEST26-001', 'TEST', 'E2E FIXTURE', 'ETHIOPIA', 'Yirgacheffe', 'Heirloom', 'Washed',
   '2000m', '26.06.28', '26.07.03', '60g', '#95 (라이트)', 'Jasmine, bergamot');
