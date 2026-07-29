-- 비파괴 마이그레이션: 랏(lot)에서 워싱스테이션을 분리한 컬럼 추가
ALTER TABLE beans ADD COLUMN washing_station TEXT DEFAULT '';
