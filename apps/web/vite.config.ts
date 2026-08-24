import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// 조회(/)·덱(/deck)의 MPA 빌드 — 두 HTML이 각각 진입점이고 산출물은 배포 루트 dist/에 떨어진다.
// 랩(@bnhd/lab)은 같은 dist/lab 아래로 따로 빌드되므로, 이 빌드가 먼저 돌아야 한다
// (emptyOutDir가 dist/를 비우기 때문 — 순서는 루트 package.json의 build 스크립트가 보장한다).
//
// ⚠️ base는 반드시 "/" 절대 경로. 인쇄된 QR은 /{KEY} 같은 경로로 들어오는데, 상대 경로("./")면
// 그 경로를 기준으로 자산을 찾아 깨진다. e2e/routing.spec.ts가 이 계약을 지킨다.
export default defineConfig({
  base: "/",
  publicDir: "public", // theme.css·lab.css를 해시 없이 그대로 통과 — 랩이 절대 경로로 참조한다
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        deck: fileURLToPath(new URL("./deck.html", import.meta.url)),
      },
    },
  },
  server: {
    // 로컬 개발: wrangler pages dev(8790)의 API를 프록시 — 랩과 같은 포트를 본다
    proxy: { "/api": "http://localhost:8790" },
  },
});
