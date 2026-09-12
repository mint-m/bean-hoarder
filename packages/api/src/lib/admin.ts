// 관리자 판정 — secret ADMIN_USERCODES(콤마 구분 유저코드)와 대조한다.
//
// DB에 role 컬럼을 두지 않은 이유: 서비스에 특별 취급되는 계정이 없다는 원칙(CLAUDE.md)을 지키고,
// 첫 관리자를 누가 지정하느냐는 부트스트랩 문제를 secret 하나로 끝내기 위해서다. 관리자도 일반 계정으로
// 로그인하고, 서버가 요청마다 이 목록과 대조할 뿐이다.
import { createMiddleware } from "hono/factory";
import type { AppEnv, Env } from "../env";
import { json } from "./http";

export function isAdmin(env: Env, usercode: string): boolean {
  const list = (env.ADMIN_USERCODES ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return list.includes(usercode.toUpperCase());
}

/**
 * 관리자 전용 — authRequired 뒤에 건다. 관리자가 아니면 **404**(403이 아니라): 관리 엔드포인트의 존재
 * 자체를 일반 사용자에게 알리지 않는다. 응답은 app.notFound와 같은 형태다.
 */
export const adminRequired = createMiddleware<AppEnv>(async (c, next) => {
  if (!isAdmin(c.env, c.get("user").usercode)) return json({ ok: false, error: "not found" }, 404);
  await next();
});
