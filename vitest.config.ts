import { defineConfig } from "vitest/config";

// Phase 0: 기존 순수 함수 테스트(v2 소스를 그대로 import)를 Vitest로 구동한다.
// Phase 1에서 packages/*의 TS 테스트와 @cloudflare/vitest-pool-workers 통합 테스트가 추가된다.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.mjs", "packages/**/*.test.ts", "apps/**/*.test.ts"],
  },
});
