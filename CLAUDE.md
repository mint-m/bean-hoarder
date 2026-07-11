# Bean-Hoarder 작업 가이드

커피 원두 소분 라벨링(QR) & 조회 서비스. Cloudflare Pages + Functions + D1, 운영비 0원.
현재 [MIGRATION_PLAN.md](MIGRATION_PLAN.md)에 따라 실서비스 전환 마이그레이션 진행 중.

## 명령어

```bash
npm ci                 # 의존성 설치 (루트, npm workspaces)
npm test               # Vitest 전체 실행 (tests/ + packages/ + apps/)
npm run lint           # Biome 체크 (tests/, packages/, apps/ 만 대상)
npm run lint:fix       # Biome 자동 수정
npm run check          # lint + test

# 로컬 개발 서버 (v2/)
cd v2
npx wrangler d1 execute bnhd-v2 --local --file=schema.sql   # 로컬 D1 초기화 (1회)
npx wrangler d1 execute bnhd-v2 --local --file=seed.sql     # 데모 계정/원두 (선택)
npx wrangler pages dev public --binding INVITE_CODE=test    # http://localhost:8788
```

데모 계정: 유저코드 `DEMO` / 암호 `0000`.

## 아키텍처 지도

- `v2/public/` — 라이브 정적 페이지 (index=QR 조회, admin=랩, deck=덱). 브라우저 ES 모듈, 빌드 없음.
- `v2/functions/api/[[path]].js` — Pages Functions 라우터 (Phase 1에서 Hono로 교체 예정).
- `v2/functions/api/_lib.js` — env/request 의존 없는 순수 헬퍼. 테스트 대상.
- `v2/public/label.js` — 라벨 SVG 렌더러 (3사이즈). 순수 모듈, 테스트 대상.
- `v2/public/autofill.js` — 상품 페이지 텍스트 → 필드 휴리스틱 파서. 테스트 대상.
- `tests/` — Vitest 단위 테스트 (v2 소스를 직접 import).
- `packages/`, `apps/` — 마이그레이션으로 생기는 새 TS 코드 (npm workspaces).
- 배포: `main` 푸시 → 프리뷰, `deploy` 푸시 → 프로덕션 (`.github/workflows/deploy.yml`).
  `main → deploy` 승격 PR은 **Squash and merge** (linear history 규칙).

## 규칙과 함정

- **API 계약 불변**: 마이그레이션 중 기존 엔드포인트의 요청/응답 형태를 바꾸지 않는다
  (라이브 프론트가 그대로 동작해야 함). 변경이 필요하면 먼저 계획 문서에 기록.
- **QR 호환**: KEY 체계(`{유저코드4}{연도2}-{순번3}`)와 `bnhd.pages.dev` 도메인은 인쇄된
  라벨과 묶여 있다 — 절대 변경 금지.
- `v2/migrate_drop.sql`은 초기 재생성용 기록 — **실행 금지**.
- D1 스키마 변경은 새 `migrate_*.sql` 파일 추가 (기존 파일 수정 금지), README 운영 섹션에 순서 기록.
- 루트 package.json에 `"type": "module"`을 넣지 말 것 — v2의 vendored CJS(qrcode.js)와
  Node 테스트 로더 해석이 깨진다. 새 패키지는 각자 package.json에 type을 선언한다.
- Biome 대상은 `tests/`, `packages/`, `apps/` — v2 레거시 JS는 건드리지 않는다(Phase별 이식 시 TS화).
- 커밋 전 `npm run check` 통과 확인.
