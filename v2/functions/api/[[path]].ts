// Cloudflare Pages Functions 어댑터 — 라우팅·로직은 @bnhd/api(Hono, packages/api)로 이전됐다.
// Pages가 /api/* 요청을 이 파일로 보내면 Hono 앱에 그대로 위임한다.
import type { Env } from "@bnhd/api";
import app from "@bnhd/api";

export const onRequest: PagesFunction<Env> = (ctx) => app.fetch(ctx.request, ctx.env);
