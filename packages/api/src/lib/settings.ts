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

/**
 * 지금 가입 모드. 가입은 모든 요청이 이걸 먼저 읽으므로, **settings 테이블이 아직 없는 DB**(마이그레이션보다
 * 코드가 먼저 올라간 경우)에서도 죽지 않고 invite로 본다 — 행이 없을 때와 같은 동작이라 계약도 그대로다.
 * 마이그레이션이 늦게 들어가도 가입 전체가 500이 되지 않게 하는 장치이고, 다른 오류는 그대로 던진다.
 */
export async function getSignupMode(db: Db): Promise<SignupMode> {
  try {
    const row = await db
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(eq(schema.settings.key, SIGNUP_MODE_KEY))
      .get();
    return isSignupMode(row?.value) ? row.value : "invite";
  } catch (e) {
    if (isMissingTable(e)) return "invite";
    throw e;
  }
}

/** D1(SQLite)의 "no such table" — drizzle이 원인을 cause로 감싸므로 사슬을 따라가며 본다. */
function isMissingTable(e: unknown): boolean {
  for (let cur: unknown = e; cur; cur = (cur as { cause?: unknown }).cause) {
    if (String((cur as { message?: unknown }).message ?? cur).includes("no such table")) return true;
  }
  return false;
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
