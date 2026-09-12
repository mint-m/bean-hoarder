// 서비스 설정 — D1 settings 테이블의 key/value. 지금 키는 signup_mode 하나다.
//
// 가입 모드: invite(초대코드 필요, 기본) · open(누구나) · closed(받지 않음). 초대코드 값 자체는 여전히
// Cloudflare secret(INVITE_CODE)이다 — 여기서 바꾸는 것은 "지금 문이 열려 있는가"뿐이라, 코드가 DB로
// 들어오지 않고 secret 회전 절차도 그대로다. 행이 없으면 invite — 마이그레이션 전 환경과 같은 동작.
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { schema } from "../db";

export const SIGNUP_MODES = ["invite", "open", "closed"] as const;
export type SignupMode = (typeof SIGNUP_MODES)[number];
const SIGNUP_MODE_KEY = "signup_mode";

export function isSignupMode(v: unknown): v is SignupMode {
  return typeof v === "string" && (SIGNUP_MODES as readonly string[]).includes(v);
}

export async function getSignupMode(db: Db): Promise<SignupMode> {
  const row = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, SIGNUP_MODE_KEY))
    .get();
  return isSignupMode(row?.value) ? row.value : "invite";
}

export async function setSignupMode(db: Db, mode: SignupMode): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key: SIGNUP_MODE_KEY, value: mode })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: mode, updated_at: sql`datetime('now')` },
    })
    .run();
}
