// Cloudflare 바인딩과 Hono 앱 환경 타입.
export interface Env {
  DB: D1Database;
  /** 로스터리 로고 오브젝트 저장 (bnhd-logos 버킷, 키 {usercode}/{roastery}) */
  LOGOS: R2Bucket;
  /** 가입 초대코드 — Cloudflare secret (wrangler pages secret put INVITE_CODE) */
  INVITE_CODE?: string;
  /**
   * AI 인식 대행용 서비스 키 — Cloudflare secret (wrangler pages secret put GEMINI_API_KEY).
   * 본인 키를 넣지 않은 사용자에게 하루 몇 번 AI 인식을 제공한다(lib/ai-quota.ts).
   * 없어도 서비스는 정상 동작한다 — 클라이언트가 규칙 기반 파서로 폴백한다.
   */
  GEMINI_API_KEY?: string;
  /**
   * 데모 관리자 키 — Cloudflare secret (wrangler pages secret put DEMO_ADMIN_KEY).
   * DEMO는 자격증명이 공개돼 있어 쓰기가 막혀 있는데(app.ts의 writeAllowed), 그러면 데모 카드를
   * 앱에서 고칠 방법도 함께 사라진다. 로그인 때 이 키를 함께 제시한 세션에만 쓰기를 열어
   * "공개 계정은 읽기 전용, 운영자는 수정 가능"을 동시에 만족시킨다.
   * 설정하지 않으면 기능 자체가 꺼진다 — 그 배포에서 DEMO는 순수 읽기 전용이다.
   */
  DEMO_ADMIN_KEY?: string;
}

export interface AuthedUser {
  usercode: string;
  /** 세션 토큰으로 인증한 경우 그 토큰의 해시 — 로그아웃(해당 세션 폐기)에 사용 */
  sessionTokenHash?: string;
  /** 관리자 세션(DEMO_ADMIN_KEY로 로그인)인가 — 데모 쓰기 제한을 통과한다 */
  admin?: boolean;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { user: AuthedUser };
};
