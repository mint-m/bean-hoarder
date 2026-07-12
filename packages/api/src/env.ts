// Cloudflare 바인딩과 Hono 앱 환경 타입.
export interface Env {
  DB: D1Database;
  /** 로스터리 로고 오브젝트 저장 (bnhd-logos 버킷, 키 {usercode}/{roastery}) */
  LOGOS: R2Bucket;
  /** 가입 초대코드 — Cloudflare secret (wrangler pages secret put INVITE_CODE) */
  INVITE_CODE?: string;
}

export interface AuthedUser {
  usercode: string;
  /** 세션 토큰으로 인증한 경우 그 토큰의 해시 — 로그아웃(해당 세션 폐기)에 사용 */
  sessionTokenHash?: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { user: AuthedUser };
};
