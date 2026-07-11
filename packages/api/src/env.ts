// Cloudflare 바인딩과 Hono 앱 환경 타입.
export interface Env {
  DB: D1Database;
  /** 가입 초대코드 — Cloudflare secret (wrangler pages secret put INVITE_CODE) */
  INVITE_CODE?: string;
}

export interface AuthedUser {
  usercode: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { user: AuthedUser };
};
