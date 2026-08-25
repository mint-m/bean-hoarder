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
npx wrangler d1 execute bnhd-v2 --local --file=db/seed.sql    # 데모/테스트 계정 + 데모 원두 (선택)
npm run build                                                 # dist/ 생성 (최초 1회·수정 후)
npx wrangler pages dev dist --binding INVITE_CODE=test \
  --d1 DB=f6b539d0-3394-4011-9f00-f3961d549409 \
  --r2 LOGOS=bnhd-logos                                     # http://localhost:8788
# --d1/--r2 플래그 필수: wrangler 4.x pages dev가 wrangler.toml의 바인딩을 무시함
```

시드 계정은 `TEST` / `0000` 하나뿐이다(로컬·e2e 전용). 데모는 계정이 아니라 정적 페이지(`/demo`)라
로그인이 필요 없다 — 아래 "데모는 DB가 아니라 콘텐츠다" 항목 참고.

## 절대 바꾸지 말 것

- **QR 호환**: KEY 체계(`{유저코드4}{연도2}-{순번3}`)와 `bnhd.pages.dev` 도메인은 인쇄된
  라벨과 묶여 있다 — 절대 변경 금지. 커스텀 도메인·Workers 이전을 보류한 이유도 이것이다.
- **API 계약 불변**: 기존 엔드포인트의 요청/응답 형태를 바꾸지 않는다 — 라이브 프론트가 그대로
  동작해야 한다. `packages/api/test/app.test.ts`가 **계약 문서**이므로 상태 코드나 메시지를
  바꾸는 변경은 그 자체로 계약 파괴다. 필요하면 먼저 계획 문서에 기록한다.
- 루트 package.json에는 `"type"`을 선언하지 않는다 — 각 패키지가 자신의 package.json에
  type을 선언한다. (원래 근거였던 vendored CJS는 제거됐지만, 루트에 type을 올리려면
  전체 check + e2e로 검증한 뒤에만.)

## 걸려 넘어지기 쉬운 것

- **헤드라인 조합 규칙은 `@bnhd/schema/headline` 한 곳뿐**(조회·덱·라벨이 함께 import). 두 가지가
  얽혀 있으니 주의: (1) 반드시 **서브패스** `@bnhd/schema/headline`로 가져온다 — 인덱스
  `@bnhd/schema`를 import하면 zod가 딸려와 조회·덱 번들이 부푼다(이 격리가 서브패스로 나눈 이유다).
  (2) 이 함수는 **대문자화를 하지 않는다** — 조회·덱은 CSS `text-transform`으로, 라벨은 SVG라
  호출부에서 `.toUpperCase()`를 직접 건다. 공유 함수에 대문자를 넣으면 화면이 이중으로 처리된다.
- **`setState(updater)` 안에서 바깥 변수를 채우고 곧바로 읽지 말 것.** React는 대기 중인 업데이트가
  없을 때만 updater를 즉시 실행한다(eager state) — 직전에 다른 상태 변경이 있으면 렌더까지 미뤄진다.
  그래서 "updater 안에서 결과를 모으고 호출 직후 그 값으로 성공을 판정"하면 **되다 안 되다** 한다.
  자동 채우기가 정확히 이걸로 깨져서(인식에 성공하고도 "이미 다 입력돼 있습니다") 지금은 다음 상태를
  **updater 바깥에서 순수하게 계산**한 뒤 넘긴다 — `Workspace.fillParsed` 참고. 최신 폼은 렌더마다
  갱신하는 `formRef`로 읽는다.
- **`db/seed.sql`은 로컬·e2e 픽스처다 — 원격 D1에 실행하지 말 것.** `TEST` 계정의 암호가 저장소에
  적혀 있어, 원격에 넣으면 누구나 로그인하는 계정이 라이브에 생긴다. **서비스에 특별 취급되는
  계정은 없다** — 예전엔 공개 데모 계정을 두고 서버가 쓰기를 막았지만, 그 구조는 계정을 관리할
  방법까지 함께 없앴다. 지금은 구경거리가 계정이 아니라 페이지라 그 문제 자체가 없다.
- **데모는 DB가 아니라 콘텐츠다 — D1과 이어 붙이지 말 것.** 덱(`/demo`)도 카드(`/DEMO…`)도
  `apps/web/src/demo-beans.json` 하나로 그리는 정적 페이지이고, D1은 데모를 전혀 모른다.
  조회 페이지가 `DEMO` 접두 KEY를 API 대신 이 JSON으로 답한다(`apps/web/src/viewer.ts`) —
  유저코드 알파벳에 `O`가 없어 **`DEMO`는 실계정에 발급될 수 없으므로** 그 분기는 영구히 안전하다.
  이 격리가 요점이다. 데모가 D1을 타는 순간 "라이브와 저장소 중 어느 쪽이 진짜냐"가 생기고,
  동기화 스크립트와 어긋남 검사가 따라붙는다 — 실제로 그렇게 만들었다가 걷어냈다.
  내용을 바꾸려면 로컬 랩에서 꾸민 뒤 `npm run gen:demo-beans`로 떠 온다(로컬 D1 → JSON, 단방향).
  `e2e/smoke.spec.ts`가 `/api/**`를 끊고도 데모가 뜨는지 확인해 이 격리를 지킨다.
- **덱 카드 마크업·스타일은 한 벌뿐이다** — `apps/web/src/lib/wallet-card.ts`(마크업)와
  `apps/web/public/deck.css`(스타일)를 `/deck`과 `/demo`가 함께 쓴다. 한쪽만 고치면 데모와 실제
  덱이 달라 보인다. 클래스 이름이 그 둘 사이의 계약이다.
- **랩 개발 서버는 8790**: `npm run dev -w @bnhd/lab`의 Vite 프록시가 8790을 본다
  (`apps/lab/vite.config.ts`). 위 wrangler 명령을 그대로 쓰면 8788에 떠서 `/api`가 죽으므로
  랩을 붙일 때는 `--port 8790`을 준다. 8788은 e2e 전용 — Playwright가 직접 띄운다.
- **배포물은 전부 빌드 산출물**: `dist/`는 gitignore이고 `npm run build`가 만든다 —
  `@bnhd/web`(조회·덱)이 먼저 `dist/`를 비우고 채운 뒤 `@bnhd/lab`이 `dist/lab`에 얹힌다.
  **순서를 바꾸면 랩이 지워진다.** wrangler는 `dist`만 서빙하므로 빌드 전에는 아무것도 안 뜬다.
- **필드 추가 = `packages/schema`의 BEAN_FIELDS 한 줄 + D1 마이그레이션 SQL.**
  CSV 헤더·필수 규칙·Zod 스키마·타입이 전부 여기서 파생되므로 다른 곳은 손댈 필요가 없다.
- D1 스키마 변경은 **새 `migrate_*.sql` 파일 추가** (기존 파일 수정 금지). 같은 변경을
  `db/schema.sql`에도 반영한다 — 새 환경은 그 파일 하나로 생성되고, `CREATE TABLE IF NOT EXISTS`는
  이미 있는 테이블에 컬럼을 더해 주지 않으므로 둘 다 필요하다.
  **원격에 적용이 끝난 마이그레이션 파일은 지운다**(이력은 git에 남는다) — `db/`에 `migrate_*.sql`이
  보인다는 것이 곧 "아직 원격에 안 넣었다"는 신호가 되게 한다. 원격 D1에 미적용 마이그레이션이
  남아 조용히 깨진 전례가 있어, 남아 있는 파일 자체를 그 경보로 쓴다.
<!-- check-docs:ignore-start -->
- **`404.html`을 만들지 말 것.** Pages는 매치되는 파일이 없는 경로에 `index.html`을 준다 —
  인쇄된 QR `/{KEY}`가 조회 페이지로 떨어지는 이유가 그것뿐이다. `404.html`이 있으면 그 폴백이
  꺼져 **인쇄된 라벨이 전부 죽는다.** `_redirects` 캐치올로는 되돌릴 수 없다(`/* /index.html 200`은
  무한 루프로 거부되고, 통과하는 `/* / 200`은 CSS·JS까지 삼킨다). 미등록 KEY 안내는 이미 조회
  페이지 안에 있으므로 별도 404 페이지는 위험할 뿐 아니라 중복이다. `e2e/routing.spec.ts`가 지킨다.
<!-- check-docs:ignore-end -->
- `main → deploy` 승격 PR은 반드시 **Create a merge commit** — Squash·Rebase는 규칙이 막는다.
  둘은 `main`의 커밋을 `deploy`의 조상으로 남기지 않아 다음 승격을 `add/add` 충돌로 막는다
  (v1.2.0 때 36건). 이유는 README "운영"의 브랜치 보호 규칙 항목에 있다.
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
| 변경 이력 (한 줄 요약) | [README.md](README.md) "주요 변경" |
| 릴리스 노트 (전문) | GitHub Releases — 태그가 버전의 단일 소스 |
| 남은 작업·백로그 | GitHub Issues (README "로드맵"이 색인) |
| 설계 배경·아키텍처 근거 | [README.md](README.md) "구조" · [HOW_IT_WORKS.html](HOW_IT_WORKS.html) |
| 디자인 시스템 (색·타이포·컴포넌트·컬러 규칙) | [DESIGN.md](DESIGN.md) — 값의 단일 소스는 `apps/web/public/theme.css` |
| 원칙·금지 사항·함정 | 이 문서 |

- **문서 파일을 늘리지 않는다.** 새 `.md`를 만들기 전에 기존 문서의 한 섹션으로 들어갈 수
  없는지 먼저 본다. 문서가 늘면 같은 사실이 여러 곳에 흩어지고, 그게 곧 낡는 원인이다.
  `STRUCTURE.md`는 예외인데 — 전부 생성물이라 사람이 유지할 게 없고, README에서 덜어낸
  것이지 새로 더한 게 아니다.
- **문서는 독자로 가른다.** README는 사람이 읽는다(무엇인지·어떻게 쓰는지·어떻게 운영하는지),
  STRUCTURE.md는 코드 파악용, DESIGN.md는 디자인 시스템(색·타이포·컴포넌트 규칙), 이 문서는 원칙.
  한 파일이 여러 독자를 상대하기 시작하면 양쪽 모두에게 불친절해진다.
- **구조는 어느 문서에도 손으로 적지 않는다.** 파일 목록은 저장소를 보면 알 수 있으므로
  옮겨 적으면 낡기만 한다. `gen-structure.mjs`가 `git ls-files`·`app.ts`·`schema.sql`에서
  직접 읽어 생성하고, `npm run check`가 재생성 결과와 커밋된 내용이 같은지 검사한다.
- **파일의 설명을 바꾸려면 그 파일의 머리 주석을 고친다.** 설명이 코드 옆에 있으면 코드를
  고칠 때 같이 눈에 들어온다 — 이 규칙 덕에 세션 모듈의 낡은 주석이 실제로 잡혔다.
  새 파일에는 "무엇이고 왜 있는지" 한두 줄 주석을 단다. 안 달면 표에 `—`로 남는다.
- **이 문서에는 구조를 쓰지 않는다.** 저장소를 봐도 알 수 없는 것만 쓴다 — 왜 그래야 하는지,
  무엇을 건드리면 깨지는지.
- 생성되지 않는 구간(운영 절차, 이 문서)이 가리키는 경로는 `npm run check:docs`
  (`scripts/check-docs.mjs`)가 실존만 검사한다 — 내용의 옳고 그름은 판단하지 않는다.
- 이력처럼 **지워진 파일을 일부러 언급해야 하는 구간**은 `check-docs:ignore-start` /
  `check-docs:ignore-end` HTML 주석으로 감싼다. 위의 "404 페이지를 만들지 말 것" 항목이 그 예다 —
  만들면 안 되는 파일이라 실존하지 않는 경로를 일부러 적고 있다.
- **버전은 코드에 적지 않는다.** 루트 `package.json`은 `private`이라 `version`이 없고, 태그가
  단일 소스다. 버전이 붙는 시점은 `main` 병합이 아니라 **`deploy` 승격**이다 — 절차는
  README "운영"의 "프로덕션 승격 절차"·"릴리스".
