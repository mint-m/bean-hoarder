// Playwright 스모크 e2e — 실제 wrangler pages dev(+ 로컬 D1/R2, e2e 전용 persist 디렉터리)를
// 띄워 공개 조회·랩 로그인·등록·덱까지 사용자 동선을 검증한다. 실행: npm run e2e
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:8788",
  },
  webServer: {
    command: "npm run e2e:server",
    // 데모 시드가 조회되면 서버+DB 준비 완료
    url: "http://127.0.0.1:8788/api/bean/DEMO26-001",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
