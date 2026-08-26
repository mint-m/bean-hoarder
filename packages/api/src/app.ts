// Bean-Hoarder v2 API — Hono 앱 (Cloudflare Pages Functions에 마운트).
// 기존 [[path]].js 라우터를 계약(경로·메서드·응답 형태·상태 코드·메시지) 그대로 이식했다.
//
// 인증: Authorization: Bearer {유저코드}:{4자리 암호}  (편의용 암호 — 쓰기에만 필요, 조회는 공개)
// 라우트:
//   POST   /api/signup        초대코드 + 암호 → 유저코드 자동 발급 + 복구키(1회 표시) + 세션 토큰
//   POST   /api/login         유저코드 + 암호 → 세션 토큰 (실패 rate limit)
//   DELETE /api/session       현재 세션 폐기 (로그아웃)
//   POST   /api/recover       복구키 + 새 암호 → 유저코드 재확인, 복구키 회전 + 세션 토큰
//   POST   /api/beans         원두 등록 (KEY 서버 채번)
//   GET    /api/beans         내 원두 목록
//   GET    /api/bean/{KEY}    공개 조회
//   PUT    /api/bean/{KEY}    수정 (소유자만)
//   PATCH  /api/bean/{KEY}/archive  숨기기(보관) 토글 { archived: bool } (소유자만)
//   DELETE /api/bean/{KEY}    삭제 (소유자만)
//   GET    /api/export.csv    내 데이터 CSV 백업
//   POST   /api/import        CSV 백업 복원 (내 유저코드 KEY만, 같은 KEY는 덮어쓰기)
//   GET    /api/logos         내 로스터리 로고 목록
//   PUT    /api/logos         로스터리 로고 저장/교체 (이미지 100KB 제한)
//   DELETE /api/logos         로스터리 로고 삭제
//   POST   /api/fetch         상품 페이지 텍스트/로고 이미지 프록시 (로그인 사용자 전용)
//   POST   /api/extract       AI 인식 대행 (서비스 키, 계정별·전역 하루 한도 — 본인 키가 있으면 브라우저 직접)
// 환경변수: INVITE_CODE는 Cloudflare secret으로 관리 (wrangler pages secret put INVITE_CODE)
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { authenticate } from "./auth";
import type { AppEnv } from "./env";
import { json } from "./lib/http";
import { login, logout, recoverAccount, signup } from "./routes/auth";
import { exportCsv, importCsv } from "./routes/backup";
import { addBean, deleteBean, getBeanPublic, listBeans, setArchived, updateBean } from "./routes/beans";
import { extractWithAi } from "./routes/extract";
import { deleteLogo, listLogos, putLogo } from "./routes/logos";
import { fetchExternal } from "./routes/proxy";

const authRequired = createMiddleware<AppEnv>(async (c, next) => {
  const result = await authenticate(c.env, c.req.raw);
  if (result.kind === "limited") {
    return json({ ok: false, error: "시도가 너무 많습니다. 잠시 후 다시 시도하세요." }, 429);
  }
  if (result.kind === "fail") {
    return json({ ok: false, error: "인증 실패 — 유저코드와 암호를 확인하세요." }, 401);
  }
  c.set("user", result.user);
  await next();
});

const app = new Hono<AppEnv>().basePath("/api");

app.post("/signup", signup);
app.post("/login", login); // 유저코드+암호 → 세션 토큰 (rate limit)
app.delete("/session", authRequired, logout); // 현재 세션 폐기
app.post("/recover", recoverAccount);

app.get("/bean/:key", getBeanPublic); // 공개 — QR 스캔 조회
app.put("/bean/:key", authRequired, updateBean);
app.delete("/bean/:key", authRequired, deleteBean);
app.patch("/bean/:key/archive", authRequired, setArchived);

app.post("/beans", authRequired, addBean);
app.get("/beans", authRequired, listBeans);
app.get("/export.csv", authRequired, exportCsv);
app.post("/import", authRequired, importCsv);
app.get("/logos", authRequired, listLogos);
app.put("/logos", authRequired, putLogo);
app.delete("/logos", authRequired, deleteLogo);
// 외부 페이지를 우리 서버가 대신 받아오는 프록시 — 가입(초대코드)을 통과한 계정만 쓸 수 있다.
app.post("/fetch", authRequired, fetchExternal);
// AI 인식 대행 — 서비스 키를 쓰므로 계정별·전역 하루 한도를 건다 (lib/ai-quota.ts)
app.post("/extract", authRequired, extractWithAi);

app.notFound(() => json({ ok: false, error: "not found" }, 404));
// 5xx는 구조화 JSON으로 로깅 — wrangler pages deployment tail / 대시보드 Real-time Logs에서
// method·path·stack으로 바로 원인을 추적할 수 있게 한다. 응답 형태는 종전과 동일.
app.onError((err, c) => {
  console.error(
    JSON.stringify({
      level: "error",
      msg: String(err),
      stack: err instanceof Error ? err.stack : undefined,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
    }),
  );
  return json({ ok: false, error: `서버 오류: ${String(err)}` }, 500);
});

export default app;
export type { AppEnv, Env } from "./env";
