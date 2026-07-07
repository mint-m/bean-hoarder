-- 데모 계정(유저코드 DEMO, 암호 0000, 복구키 F89E-5079-5A48-3F33-62B0) + 데모 원두
INSERT OR IGNORE INTO users (usercode, pass_hash, recovery_hash) VALUES
  ('DEMO', 'ae399e68ab3b10ba60abbb7a9859e53785817f453f13528a2fd85557daf1ce47',
   '0a915ff66685ba15421a8c45464e63172507de5b77851d660451a3215f1f1185');

INSERT OR IGNORE INTO beans (key, usercode, roastery, origin, region, variety, process,
  altitude, harvest, roast_date, package_date, net_weight, agtron, tasting_note, memo, source_url) VALUES
  ('DEMO26-001', 'DEMO', 'DANCHE', 'ETHIOPIA', 'Yirgacheffe, Gedeb', '74158', 'Washed',
   '2100m', '25/26', '26.06.28', '26.07.03', '60g', '라이트', 'Jasmine, bergamot, white peach',
   '재구매 의사 있음', 'https://example.com/beans/yirgacheffe-gedeb');
