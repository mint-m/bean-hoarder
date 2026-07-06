-- 데모 계정 + 데모 원두 (조회 데모용)
INSERT OR IGNORE INTO users (usercode, roastery, token_hash) VALUES
  ('DEMO', 'DANCHE', '1e3d8b5aede7714c81e7ebda2c99e5137d2e2d560a751e82d8a9ad26bbd5e9c5');

INSERT OR IGNORE INTO beans (key, usercode, roastery, origin, region, variety, process,
  altitude, harvest, roast_date, package_date, net_weight, agtron, tasting_note, source_url) VALUES
  ('DEMO26-001', 'DEMO', 'DANCHE', 'ETHIOPIA', 'Yirgacheffe, Gedeb', '74158', 'Washed',
   '2100m', '25/26', '26.06.28', '26.07.03', '60g', '~65', 'Jasmine, bergamot, white peach',
   'https://example.com/beans/yirgacheffe-gedeb');
