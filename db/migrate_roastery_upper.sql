-- 로스터리 저장값 대문자 소급 — 등록·수정·복원은 이제 로스터리를 대문자로 저장하고(normalizeRoastery),
-- 조회·덱은 CSS text-transform을 걷어내 저장값을 그대로 보인다. 옛 행을 올려 두지 않으면 승격하는
-- 순간 기존 원두가 전부 원문 대소문자("BigSur Coffee")로 보인다. **승격 전에** 적용한다.
--
-- SQLite upper()는 ASCII만 바꾼다(normalizeRoastery는 JS toUpperCase). 한글은 대소문자가 없어
-- 상관없지만 é 같은 비ASCII 소문자가 든 행은 남는다 — 적용 뒤 아래로 확인하고, 남은 행은 랩에서
-- 열어 저장하면 서버가 맞춘다.
--   SELECT key, roastery FROM beans WHERE roastery GLOB '*[a-z]*';
UPDATE beans SET roastery = upper(roastery) WHERE roastery != upper(roastery);
