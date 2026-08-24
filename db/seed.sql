-- 데모/테스트 계정 + 데모 원두 카드.
-- pass_hash는 구형(SHA-256) 포맷 — 첫 로그인 시 서버가 PBKDF2로 자동 업그레이드한다.
--
-- ⚠️ 이 파일은 **원격 D1에 실행하지 말 것** — 쓰기 제한이 없는 TEST 계정이 들어 있다.
--    라이브 데모 카드를 고치려면 랩에서 관리자 키로 로그인해 앱에서 수정한다 (README "운영").
--
-- 데모 계정: 유저코드 DEMO, 암호 0000, 복구키 F89E-5079-5A48-3F33-62B0
-- ⚠️ DEMO는 자격증명이 공개돼 있어 서버가 **쓰기를 막는다**(packages/api/src/app.ts의 writeAllowed).
--    등록·수정·삭제가 필요한 자동 테스트는 아래 TEST 계정을 쓴다.
INSERT OR IGNORE INTO users (usercode, pass_hash, recovery_hash) VALUES
  ('DEMO', 'ae399e68ab3b10ba60abbb7a9859e53785817f453f13528a2fd85557daf1ce47',
   '0a915ff66685ba15421a8c45464e63172507de5b77851d660451a3215f1f1185');

-- 테스트 계정(유저코드 TEST, 암호 0000) — e2e 전용. 쓰기 제한이 없어 등록 동선을 끝까지 검증할 수 있다.
-- 로컬·e2e DB에만 넣는다.
INSERT OR IGNORE INTO users (usercode, pass_hash, recovery_hash) VALUES
  ('TEST', '37d315b6d9de4369664a0f20c49a8d7b56703fc74245b5b83588fbe2ac6c98c6',
   'f3694ec983ba1134bb1b67d54b97924ea67642bd4bd0cd154993b41cfa6ed84a');

-- 데모 원두 — 로컬·e2e에서 조회 동선(/{KEY})이 실물 카드를 갖도록 심는다.
-- 라이브 데모 카드의 단일 소스는 여기가 아니라 원격 D1이다(관리자 키 로그인으로 앱에서 수정).
-- INSERT OR REPLACE라 재실행하면 로컬 데모가 이 내용으로 되돌아온다.
INSERT OR REPLACE INTO beans (key, usercode, roastery, origin, region, producer, lot, washing_station,
  variety, process, altitude, harvest, roast_date, package_date, net_weight, agtron,
  tasting_note, memo, source_url) VALUES
  ('DEMO26-001', 'DEMO', 'DANCHE', 'ETHIOPIA', 'Yirgacheffe, Gedeb', 'Smallholder farmers', 'Worka Sakaro',
   'Gedeb CWS', '74158', 'Washed', '2100m', '25/26', '26.06.28', '26.07.03', '60g', '#95 (라이트)',
   'Jasmine, bergamot, white peach',
   '게뎁의 소농들이 딴 체리를 워카 사카로 워싱스테이션에 모아 함께 가공한 커뮤니티 랏. 품종 74158은 에티오피아 JARC가 병충해 저항성으로 선발한 계열로, 2,100m의 재배 고도가 단단한 산미를 받쳐 준다. 자스민과 베르가못의 화사한 향 뒤로 잘 익은 백도의 단맛이 이어지고, 여운은 깔끔하게 떨어진다.',
   'https://example.com/beans/yirgacheffe-gedeb'),
  ('DEMO26-002', 'DEMO', 'SEY', 'COLOMBIA', 'Pitalito, Huila', 'William Ortiz', 'La Cabaña',
   '', 'Chiroso', 'Washed', '1700m', '26.05', '26.08.09', '26.08.23', '250g', '',
   'Melon, lime, tropical fruit',
   '윌리엄 오르티스의 라 카바냐 농장에서 시즌의 마지막 세 번째 수확분만 골라 담은 랏. 콜롬비아에서는 아직 드문 치로소를 워시드로 가공했다. 멜론과 라임을 닮은 열대 과일 향이 부드럽게 퍼지고, 워시드다운 깔끔한 마무리가 뒤를 받친다.',
   'https://www.seycoffee.com/collections/coffee/products/2026-william-ortiz-la-cabana-end-of-season-colombia'),
  ('DEMO26-003', 'DEMO', 'SEY', 'COLOMBIA', 'Pitalito, Huila', 'William Ortiz', 'La Cabaña',
   '', 'Chiroso', 'Washed', '1700m', '26.05', '26.08.14', '26.08.24', '20g', '#120 (울트라라이트)',
   'Melon, lime, tropical fruit',
   '같은 라 카바냐 치로소를 커핑용 20g으로 소분한 봉지. 한 봉지를 여러 크기로 나눠 담아도 원두 정보는 KEY마다 따로 남는다 — 로스팅일과 소분일이 봉지별로 다른 이유다.',
   '');
