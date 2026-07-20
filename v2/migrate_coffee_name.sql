-- 비파괴 마이그레이션: 시그니쳐·블렌드 네이밍용 커피 이름 컬럼 추가 (라벨/카드 헤드라인 오버라이드)
ALTER TABLE beans ADD COLUMN coffee_name TEXT DEFAULT '';
