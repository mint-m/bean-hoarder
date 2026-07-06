-- 데모 계정(유저코드 DEMO, 암호 0000) + 데모 원두
INSERT OR IGNORE INTO users (usercode, pass_hash) VALUES
  ('DEMO', 'ae399e68ab3b10ba60abbb7a9859e53785817f453f13528a2fd85557daf1ce47');

INSERT OR IGNORE INTO beans (key, usercode, roastery, origin, region, variety, process,
  altitude, harvest, roast_date, package_date, net_weight, agtron, tasting_note, source_url) VALUES
  ('DEMO26-001', 'DEMO', 'DANCHE', 'ETHIOPIA', 'Yirgacheffe, Gedeb', '74158', 'Washed',
   '2100m', '25/26', '26.06.28', '26.07.03', '60g', '~65', 'Jasmine, bergamot, white peach',
   'https://example.com/beans/yirgacheffe-gedeb');
