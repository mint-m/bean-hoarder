// Drizzle 스키마 — 기존 D1 테이블(db/schema.sql)과 1:1 대응. DDL은 여전히 schema.sql이
// 소스이며(마이그레이션은 migrate_*.sql), 이 파일은 쿼리 타입 안전성용이다.
// beans의 자유 필드 컬럼은 @bnhd/schema BEAN_FIELDS와 반드시 일치해야 한다
// — schema-drift.test.ts가 기계적으로 검증한다.
import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  usercode: text().primaryKey(),
  pass_hash: text().notNull(),
  recovery_hash: text().notNull(),
  created_at: text().notNull().default(sql`(datetime('now'))`),
});

export const beans = sqliteTable(
  "beans",
  {
    key: text().primaryKey(),
    usercode: text().notNull(),
    roastery: text().notNull(),
    origin: text().notNull().default(""),
    region: text().notNull().default(""),
    producer: text().notNull().default(""),
    lot: text().notNull().default(""),
    washing_station: text().notNull().default(""),
    variety: text().notNull().default(""),
    process: text().notNull().default(""),
    altitude: text().notNull().default(""),
    harvest: text().notNull().default(""),
    roast_date: text().notNull().default(""),
    package_date: text().notNull().default(""),
    net_weight: text().notNull().default(""),
    agtron: text().notNull().default(""),
    tasting_note: text().notNull().default(""),
    memo: text().notNull().default(""),
    source_url: text().notNull().default(""),
    coffee_name: text().notNull().default(""),
    archived: integer().notNull().default(0),
    created_at: text().notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index("idx_beans_user").on(t.usercode)],
);

// 세션 토큰 — 원문이 아니라 SHA-256 해시를 저장, 만료 90일 고정 (Phase 2 인증)
// admin=1은 데모 관리자 세션 — 공개 DEMO/0000 로그인으로는 절대 세워지지 않는다(routes/auth.ts).
export const sessions = sqliteTable("sessions", {
  token_hash: text().primaryKey(),
  usercode: text().notNull(),
  created_at: text().notNull().default(sql`(datetime('now'))`),
  expires_at: text().notNull(),
  admin: integer().notNull().default(0),
});

// 인증 시도 rate limit — bucket당 고정 윈도우 실패 카운터
export const authAttempts = sqliteTable("auth_attempts", {
  bucket: text().primaryKey(),
  count: integer().notNull().default(0),
  reset_at: text().notNull(),
});

// AI 인식 사용량 — 서비스 키로 대신 호출해 주는 몫의 하루 한도(계정별·전역).
// 사용자 본인 키는 브라우저에서 직접 나가므로 세지 않는다. 근거는 lib/ai-quota.ts.
export const aiUsage = sqliteTable("ai_usage", {
  bucket: text().primaryKey(),
  count: integer().notNull().default(0),
  reset_at: text().notNull(),
});

// R2 비용 백스톱 — 서비스 전역 월간 R2 쓰기(Class A) 카운터. 단일 행(id='global').
// 월이 바뀌면 write_count를 리셋한다(budget.ts가 판정). 자세한 근거는 lib/budget.ts 참조.
export const r2Usage = sqliteTable("r2_usage", {
  id: text().primaryKey(),
  month: text().notNull(),
  write_count: integer().notNull().default(0),
});

// 로고: 신규 행은 R2에 바이트 저장 + content_type 메타만 D1에 (data_url='').
// 레거시 행은 data_url에 인라인 — 재저장 시점에 R2로 자연 이전(lazy migration).
export const logos = sqliteTable(
  "logos",
  {
    usercode: text().notNull(),
    roastery: text().notNull(),
    data_url: text().notNull(),
    content_type: text().notNull().default(""),
    updated_at: text().notNull().default(sql`(datetime('now'))`),
  },
  (t) => [primaryKey({ columns: [t.usercode, t.roastery] })],
);
