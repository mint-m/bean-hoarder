-- 데모 계정(유저코드 DEMO, 암호 0000, 복구키 F89E-5079-5A48-3F33-62B0) + 데모 원두
-- pass_hash는 구형(SHA-256) 포맷 — 첫 로그인 시 서버가 PBKDF2로 자동 업그레이드한다.
INSERT OR IGNORE INTO users (usercode, pass_hash, recovery_hash) VALUES
  ('DEMO', 'ae399e68ab3b10ba60abbb7a9859e53785817f453f13528a2fd85557daf1ce47',
   '0a915ff66685ba15421a8c45464e63172507de5b77851d660451a3215f1f1185');

-- 데모 갱신을 반영하도록 INSERT OR REPLACE (재실행 시 기존 데모 행을 덮어씀)
INSERT OR REPLACE INTO beans (key, usercode, roastery, origin, region, producer, lot, washing_station,
  variety, process, altitude, harvest, roast_date, package_date, net_weight, agtron,
  tasting_note, memo, source_url) VALUES
  ('DEMO26-001', 'DEMO', 'DANCHE', 'ETHIOPIA', 'Yirgacheffe, Gedeb', 'Smallholder farmers', 'Worka Sakaro',
   'Gedeb CWS', '74158', 'Washed', '2100m', '25/26', '26.06.28', '26.07.03', '60g', '#95 (라이트)',
   'Jasmine, bergamot, white peach',
   '게뎁 지역 소농들의 체리를 워카 사카로 워싱스테이션에서 함께 가공한 커뮤니티 랏. 원산지 방문 중 진행한 블라인드 커핑에서 선정된 랏으로, 품종 74158은 에티오피아 JARC가 병충해 저항성으로 선발한 계열이다. 자스민과 베르가못의 화사한 향에 잘 익은 백도를 닮은 단맛과 무게감이 더해지고, 정제된 산미와 깔끔한 클린컵, 은은하게 이어지는 단맛의 여운이 특징이다.',
   'https://example.com/beans/yirgacheffe-gedeb');
