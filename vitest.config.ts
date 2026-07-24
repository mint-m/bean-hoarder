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
          // 각 패키지 안에 co-located: label/autofill은 test/*.mjs, schema는 src/*.test.ts.
          // packages/api/test/*.test.ts는 별도 workers 프로젝트(아래)가 소유하므로 제외.
          include: [
            "packages/label/test/**/*.test.mjs",
            "packages/autofill/test/**/*.test.mjs",
            "packages/schema/src/**/*.test.ts",
          ],
        },
      },
      "./packages/api/vitest.config.ts",
    ],
  },
});
