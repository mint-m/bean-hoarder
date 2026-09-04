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
          // 각 패키지 안에 co-located: label/autofill은 test/*.mjs, 나머지는 src/*.test.ts.
          // packages/api/test/*.test.ts는 별도 workers 프로젝트(아래)가 소유하므로 제외하되,
          // packages/api/src의 순수 함수 테스트(crypto·csv·net·스키마 드리프트)는 여기서 돈다.
          // 이전에는 두 프로젝트의 include 사이로 빠져 4개 파일이 조용히 실행되지 않았다.
          include: [
            "packages/label/test/**/*.test.mjs",
            "packages/autofill/test/**/*.test.mjs",
            "packages/schema/src/**/*.test.ts",
            "packages/session/src/**/*.test.ts",
            "packages/api/src/**/*.test.ts",
            "apps/web/src/**/*.test.ts",
            "apps/lab/src/**/*.test.ts",
          ],
        },
      },
      "./packages/api/vitest.config.ts",
    ],
  },
});
