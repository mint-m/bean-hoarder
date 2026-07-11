import { defineConfig } from "vitest/config";

// 프로젝트 2개:
//  - unit:    Node 환경 — 순수 함수 테스트 (v2 레거시 모듈 + packages/* 소스 테스트)
//  - workers: packages/api/vitest.config.ts — 실제 workerd + D1 통합 테스트
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/**/*.test.mjs", "packages/**/src/**/*.test.ts"],
        },
      },
      "./packages/api/vitest.config.ts",
    ],
  },
});
