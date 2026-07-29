# Bean-Hoarder 작업 가이드

커피 원두 소분 라벨링(QR) & 조회 서비스. Cloudflare Pages + Functions + D1 + R2, 운영비 0원.
실서비스 전환은 2026-07-13에 끝났고, 패스키(WebAuthn) 도입만 후속 과제로 남아 있다.

**이 문서는 원칙과 함정만 다룬다.** 디렉터리·파일 배치와 API 라우트는 생성되는
[STRUCTURE.md](STRUCTURE.md), 사용법·운영 절차는 [README.md](README.md)에 있고
여기에 옮겨 적지 않는다 (아래 "문서 관리 원칙").

## 작업 방식

- **불확실하면 진행하지 말고 물어라** — 요구사항 해석이 여러 갈래로 갈리거나 전제가 불확실하면
  가정하고 진행하지 않는다. 무엇이 불확실한지 구체적으로 짚어 질문한다. 자명한 작업(오타 수정,
  단순 리네임 등)까지 매번 확인받으라는 뜻은 아니다 — 판단은 여전히 필요하다.
- **목표를 검증 가능하게 정의하고, 검증까지 끝내야 완료다** — "버그 고침"이 아니라 "재현 테스트
  작성 → 통과시키기", "기능 추가"가 아니라 "관련 케이스 테스트 작성 → 통과 확인"으로 접근한다.
  여러 단계짜리 작업은 시작 전에 `1. [작업] → 검증: [방법]` 형태로 짧게 계획을 밝힌다. 이 저장소는
  검증 수단이 이미 갖춰져 있다 — `npm test`(Vitest 유닛 + workerd 통합), `npm run e2e`
  (Playwright), `npm run check`(커밋 전 게이트)를 실제로 돌려 확인하고, "됐다"는 주장이 아니라
  결과로 보여준다.
- **작업 시작 전에 `git fetch`하고 원격 기준으로 브랜치를 딴다** — 로컬 `main`이 며칠 뒤처진
  줄 모르고 낡은 사실 위에서 판단한 사고가 실제로 있었다.

## 명령어

```bash
npm ci                 # 의존성 설치 (루트, npm workspaces)
npm test               # Vitest 전체 (unit: node 환경 / workers: workerd+D1 통합)
npm run lint           # Biome 체크
npm run lint:fix       # Biome 자동 수정
npm run typecheck      # tsc (워크스페이스 + functions + e2e)
npm run gen:structure  # STRUCTURE.md 재생성 (저장소에서 파생)
npm run check:docs     # 문서가 가리키는 경로·npm 스크립트의 실존 검증
npm run check          # lint + typecheck + test + 문서 검증 — 커밋 전 필수
npm run e2e            # Playwright 스모크 — e2e:server(전용 .wrangler-e2e persist) 자동 기동
npm run check:full     # check + e2e — 배포 경로(디렉터리·wrangler 설정)를 건드렸다면 이걸로

# 로컬 개발 서버 (저장소 루트에서)
npx wrangler d1 execute bnhd-v2 --local --file=db/schema.sql  # 로컬 D1 초기화 (1회)
npx wrangler d1 execute bnhd-v2 --local --file=db/seed.sql    # 데모 계정/원두 (선택)
npx wrangler pages dev public --binding INVITE_CODE=test \
  --d1 DB=f6b539d0-3394-4011-9f00-f3961d549409 \
  --r2 LOGOS=bnhd-logos                                     # http://localhost:8788
# --d1/--r2 플래그 필수: wrangler 4.x pages dev가 wrangler.toml의 바인딩을 무시함
```

데모 계정: 유저코드 `DEMO` / 암호 `0000`.

## 절대 바꾸지 말 것

- **QR 호환**: KEY 체계(`{유저코드4}{연도2}-{순번3}`)와 `bnhd.pages.dev` 도메인은 인쇄된
  라벨과 묶여 있다 — 절대 변경 금지. 커스텀 도메인·Workers 이전을 보류한 이유도 이것이다.
- **API 계약 불변**: 기존 엔드포인트의 요청/응답 형태를 바꾸지 않는다 — 라이브 프론트가 그대로
  동작해야 한다. `packages/api/test/app.test.ts`가 **계약 문서**이므로 상태 코드나 메시지를
  바꾸는 변경은 그 자체로 계약 파괴다. 필요하면 먼저 계획 문서에 기록한다.
- `db/migrate_drop.sql`은 초기 재생성용 기록 — **실행 금지**.
- 루트 package.json에는 `"type"`을 선언하지 않는다 — 각 패키지가 자신의 package.json에
  type을 선언한다. (원래 근거였던 vendored CJS는 제거됐지만, 루트에 type을 올리려면
  전체 check + e2e로 검증한 뒤에만.)

## 걸려 넘어지기 쉬운 것

- **헤드라인 조합 규칙이 두 곳에 있다**: `public/headline.js`(브라우저 전역 `bhHeadline`)와
  `@bnhd/label`의 `buildHeadline`(번들). 한쪽만 고치면 라벨·카드·조회 제목이 어긋난다 —
  반드시 함께 고친다. 구조상 중복이 남은 유일한 지점이라 특히 주의할 것.
- **랩 개발 서버는 8790**: `npm run dev -w @bnhd/lab`의 Vite 프록시가 8790을 본다
  (`apps/lab/vite.config.ts`). 위 wrangler 명령을 그대로 쓰면 8788에 떠서 `/api`가 죽으므로
  랩을 붙일 때는 `--port 8790`을 준다. 8788은 e2e 전용 — Playwright가 직접 띄운다.
- **`/admin`은 빌드 산출물**: `public/admin`은 gitignore이고 CI가 배포 직전에 만든다.
  로컬에서 `/admin`을 보려면 먼저 `npm run build -w @bnhd/lab`.
- **필드 추가 = `packages/schema`의 BEAN_FIELDS 한 줄 + D1 마이그레이션 SQL.**
  CSV 헤더·필수 규칙·Zod 스키마·타입이 전부 여기서 파생되므로 다른 곳은 손댈 필요가 없다.
- D1 스키마 변경은 **새 `migrate_*.sql` 파일 추가** (기존 파일 수정 금지). 적용 순서는
  README 운영 섹션에 기록한다 — 원격 D1에 미적용 마이그레이션이 남아 조용히 깨진 전례가 있다.
- `public/`의 브라우저 JS는 Biome·tsc 대상에서 빠져 있다 — 손대면 검증 없이 배포된다.
- `deploy` 브랜치는 linear history를 요구하므로 `main → deploy` 승격 PR은 **Squash and merge**.
- **새 파일은 `git add` 후에 `npm run gen:structure`를 돌린다** — 생성기는 인덱스(커밋될 내용)만
  보므로, 스테이징 전에 생성하면 새 파일이 빠진 채로 커밋되고 CI에서 잡힌다.
- 커밋 전 `npm run check` 통과 확인. 디렉터리 배치나 wrangler 설정을 건드렸다면 `npm run check:full`.

## 문서 관리 원칙

에이전트가 만드는 변경은 코드보다 문서를 먼저 낡게 만든다. 그래서 **파생할 수 있는 건 손으로
적지 않고**, 손으로 적을 수밖에 없는 것만 남긴 뒤 그것이 코드와 어긋나면 기계가 잡게 한다.

| 사실 | 어디서 오는가 |
|---|---|
| 파일 배치, API 라우트, D1 테이블 | **생성** — `npm run gen:structure` → [STRUCTURE.md](STRUCTURE.md) |
| 각 파일이 무엇인가 | **그 파일의 머리 주석** — 생성기가 읽어 간다 |
| 서비스 소개·사용법·로컬 개발 | [README.md](README.md) |
| 배포·백업·마이그레이션 절차 | [README.md](README.md) "운영" |
| 변경 이력 | [README.md](README.md) "진행 기록" |
| 남은 작업·백로그 | GitHub Issues (README "로드맵"이 색인) |
| 설계 근거 | [DESIGN.md](DESIGN.md) |
| 원칙·금지 사항·함정 | 이 문서 |

- **문서 파일을 늘리지 않는다.** 새 `.md`를 만들기 전에 기존 문서의 한 섹션으로 들어갈 수
  없는지 먼저 본다. 문서가 늘면 같은 사실이 여러 곳에 흩어지고, 그게 곧 낡는 원인이다.
  `STRUCTURE.md`는 예외인데 — 전부 생성물이라 사람이 유지할 게 없고, README에서 덜어낸
  것이지 새로 더한 게 아니다.
- **문서는 독자로 가른다.** README는 사람이 읽는다(무엇인지·어떻게 쓰는지·어떻게 운영하는지),
  STRUCTURE.md는 코드 파악용, 이 문서는 원칙. 한 파일이 여러 독자를 상대하기 시작하면
  양쪽 모두에게 불친절해진다.
- **구조는 어느 문서에도 손으로 적지 않는다.** 파일 목록은 저장소를 보면 알 수 있으므로
  옮겨 적으면 낡기만 한다. `gen-structure.mjs`가 `git ls-files`·`app.ts`·`schema.sql`에서
  직접 읽어 생성하고, `npm run check`가 재생성 결과와 커밋된 내용이 같은지 검사한다.
- **파일의 설명을 바꾸려면 그 파일의 머리 주석을 고친다.** 설명이 코드 옆에 있으면 코드를
  고칠 때 같이 눈에 들어온다 — 이 규칙 덕에 `session.js`의 낡은 주석이 실제로 잡혔다.
  새 파일에는 "무엇이고 왜 있는지" 한두 줄 주석을 단다. 안 달면 표에 `—`로 남는다.
- **이 문서에는 구조를 쓰지 않는다.** 저장소를 봐도 알 수 없는 것만 쓴다 — 왜 그래야 하는지,
  무엇을 건드리면 깨지는지.
- 생성되지 않는 구간(운영 절차, 이 문서)이 가리키는 경로는 `npm run check:docs`
  (`scripts/check-docs.mjs`)가 실존만 검사한다 — 내용의 옳고 그름은 판단하지 않는다.
- 이력처럼 **지워진 파일을 일부러 언급해야 하는 구간**은 `check-docs:ignore-start` /
  `check-docs:ignore-end` HTML 주석으로 감싼다 (README "진행 기록"이 그 예).
