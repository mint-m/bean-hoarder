# Bean-Hoarder 작업 가이드

커피 원두 소분 라벨링(QR) & 조회 서비스. Cloudflare Pages + Functions + D1, 운영비 0원.
현재 [MIGRATION_PLAN.md](MIGRATION_PLAN.md)에 따라 실서비스 전환 마이그레이션 진행 중.

## 명령어

```bash
npm ci                 # 의존성 설치 (루트, npm workspaces)
npm test               # Vitest 전체 (unit: node 환경 / workers: workerd+D1 통합)
npm run lint           # Biome 체크 (tests/, packages/, apps/, v2 TS만 대상)
npm run lint:fix       # Biome 자동 수정
npm run typecheck      # tsc (워크스페이스 + v2/functions)
npm run check          # lint + typecheck + test — 커밋 전 필수

# 로컬 개발 서버 (v2/)
cd v2
npx wrangler d1 execute bnhd-v2 --local --file=schema.sql   # 로컬 D1 초기화 (1회)
npx wrangler d1 execute bnhd-v2 --local --file=seed.sql     # 데모 계정/원두 (선택)
npx wrangler pages dev public --binding INVITE_CODE=test \
  --d1 DB=f6b539d0-3394-4011-9f00-f3961d549409 \
  --r2 LOGOS=bnhd-logos                                     # http://localhost:8788
# --d1/--r2 플래그 필수: wrangler 4.8x pages dev가 wrangler.toml의 바인딩을 무시함
```

데모 계정: 유저코드 `DEMO` / 암호 `0000`.

## 아키텍처 지도

- `v2/public/` — 라이브 정적 페이지 (index=QR 조회, deck=덱 — 브라우저 ES 모듈, 빌드 없음).
  admin/은 apps/lab의 빌드 산출물(gitignore).
- `v2/functions/api/[[path]].ts` — Pages Functions 어댑터 (5줄) → `@bnhd/api`에 위임.
- `packages/schema/` — `@bnhd/schema`: 원두 필드 단일 소스(BEAN_FIELDS). CSV 헤더·필수 규칙·Zod
  스키마·타입이 전부 여기서 파생. **필드 추가 = 이 배열 한 줄 + D1 마이그레이션 SQL.**
- `packages/api/` — `@bnhd/api`: Hono 라우터·인증·Drizzle(D1)·SSRF 가드.
  `test/app.test.ts`가 **API 계약 문서** — 상태 코드·메시지를 바꾸는 변경은 계약 파괴.
- `v2/public/session.js` — 세션 저장·레거시 PIN 교환 공용 모듈 (`window.bhSession`, lab/deck 공유).
- `v2/public/origin-color.js` · `v2/public/headline.js` — 조회(index)·덱(deck) 공용 브라우저 모듈
  (전역 `bhOriginColor`·`bhHeadline`). `headline.js`의 헤드라인 조합 규칙(국가+세부장소[+랏] / 시그니쳐명
  오버라이드)은 `@bnhd/label`의 `buildHeadline`과 **반드시 동일하게 유지** — 라벨·카드·조회 제목이 일치해야 함.
- `packages/label/` — `@bnhd/label`: 라벨 SVG 렌더러 (3사이즈, QR 검증) + `buildHeadline` 헤드라인 조합.
  테스트 대상 단일 소스.
- `packages/autofill/` — `@bnhd/autofill`: 상품 페이지 텍스트 → 필드 휴리스틱 파서. 테스트 대상.
- `apps/lab/` — `@bnhd/lab`: 랩 React 앱 (Vite, base /admin/) — **/admin이 이 앱이다**.
  빌드 산출물 `v2/public/admin`은 gitignore — CI가 배포 직전 빌드하므로 로컬에서도
  `npm run build -w @bnhd/lab` 후에야 wrangler pages dev에서 /admin이 뜬다.
  로컬 개발: `npm run dev -w @bnhd/lab` (wrangler 8790에 /api 프록시).
- `tests/` — label/autofill 단위 테스트 (`@bnhd/*` 패키지를 import).
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
