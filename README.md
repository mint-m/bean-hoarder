# Bean-Hoarder

여러 로스터리에서 원두를 사 모아 소분·보관하는 **원두 호더**를 위한 라벨링 & 조회 서비스.
감열 라벨 프린터(203dpi)로 QR 라벨을 인쇄하고, QR을 스캔하면 그 원두의 상세 정보가 뜬다.
라벨 사이즈는 40×20 / 50×30 / 50×60mm 3종. Cloudflare Pages + Functions + D1 하나로 동작하며 **총 운영 비용 0원**.

| | |
|---|---|
| 조회 (QR 스캔 대상) | **[bnhd.pages.dev](https://bnhd.pages.dev)** — 인증 없음 |
| 랩 (등록·관리) | **[bnhd.pages.dev/admin](https://bnhd.pages.dev/admin)** — 가입/로그인 필요 |
| 덱 (내 원두 카드) | **[bnhd.pages.dev/deck](https://bnhd.pages.dev/deck)** — 로그인 필요 |
| 원두 카드 상세 (데모) | [bnhd.pages.dev/DEMO26-001](https://bnhd.pages.dev/DEMO26-001) |
| 작동 방식 (그래픽 문서) | [HOW_IT_WORKS.html](HOW_IT_WORKS.html) |
| 설계 근거 | [DESIGN.md](DESIGN.md) · 저장소 구조 [STRUCTURE.md](STRUCTURE.md) |

## 사용 흐름

1. **가입** — 운영자에게 받은 초대코드 + 내가 정한 숫자 4자리 암호 → 유저코드(4자리) 자동 발급 + **복구키**(오프라인 백업용, 1회만 표시) 발급. 브라우저에 저장되며, 유저코드+암호만 기억하면 어느 기기에서든 로그인. 복구키는 유저코드·암호를 모두 잊었을 때 재설정하는 유일한 수단.
2. **등록** — 원두 정보를 입력하면 라벨이 실시간 미리보기되고(QR은 렌더링 때마다 203dpi 실디코드 자동 검증), 등록 버튼을 누르면 서버가 KEY(`{유저코드}{연도}-{순번}`)를 채번. 로스터리·산지·로스팅일·패키징일은 필수, 산지·가공방식은 옵션 제안(블렌드 포함), 고도·수확시기는 접어서 필요할 때만 입력. 언제든 "새 원두 입력" 버튼으로 입력 중이던 내용을 지우고 깨끗한 폼에서 다시 시작할 수 있다(등록 완료 여부와 무관하게 항상 노출).
   - **자동 채우기**: 상품 페이지 URL 또는 붙여넣은 텍스트에서 휴리스틱 파서가 빈 칸을 채움 — "라벨: 값"이 한 줄에 붙은 형식뿐 아니라, 라벨과 값이 서로 다른 블록(줄)으로 나뉘는 사이트 구조도 인식한다. 본인 Gemini API 키를 설정하면 **AI 인식**도 가능 (키는 브라우저에만 저장, 텍스트는 내 키로 Google API에 직접 전송 — 서비스 서버 경유·비용 없음).
   - **로고 재사용**: 로스터리 이름을 입력한 상태에서 로고를 올리면 서버(D1)에 저장되어, 다음부터 어느 기기에서든 이름만 입력하면 자동 적용. 로스터리 이름도 내 등록 이력에서 자동 제안.
   - **기타 정보**: 개인 감상평이 아니라 산지·로스터리·생산자의 스토리나 배경 정보를 적는 칸(예: "About Beans" 형식의 소개글) — QR 조회 페이지에 공개 표시된다. 자동 채우기가 상품 페이지의 소개글(About/Description/Story 등)도 후보로 인식한다.
3. **공유·인쇄** — 상세 URL 복사 / QR 이미지 클립보드 복사가 기본 동선, 라벨 PNG(203dpi 인쇄용·320dpi)·SVG 다운로드는 선택. 라벨 사이즈는 미리보기 카드 상단의 빠른 전환에서만 40×20(기본)·50×30(여유형)·50×60(카드형) 중 선택 — 수정 위치를 한 곳으로 고정해 혼선을 없앴다. 사이즈가 커질수록 부제목·스펙 칸에 기본으로 더 많은 정보(품종·고도 등)를 표시한다(직접 커스터마이즈한 항목은 사이즈를 바꿔도 유지). 인쇄 색상은 컬러(레드+블랙)·흑백 중 선택 가능하며 **기본값은 흑백**(2도 인쇄를 지원하지 않는 감열 프린터가 많음). 부제목 줄(지역·랏·워싱스테이션·생산자 중 최대 3개)은 라벨의 핵심 정보라 **절대 잘리지 않고** 필요하면 여러 줄로 줄바꿈해 전문을 싣는다. 하단 스펙 칸(용량·로스팅포인트·가공·품종·고도·수확시기)에 표시할 정보는 값이 있는 항목만 선택 가능(빈 항목은 체크박스 비활성화)하고 ↑↓ 버튼으로 **표시 우선순위를 직접 조정**할 수 있으며 기본 순위는 용량·로스팅포인트·가공·품종·고도·수확시기 순. 값이 길면 자동으로 줄바꿈되며, 공간이 부족하면 잘리는 대신 우선순위 낮은 스펙부터 자동으로 숨겨진다(부제목·필수 날짜는 항상 유지, 스펙이 노트보다 우선). 테이스팅 노트는 스펙 칸 아래·날짜 바로 위에 **한 줄만** 표시하고, 콤마로 구분된 항목 중 그 줄에 다 들어가는 항목까지만 보여준다(중간에서 말줄임(…)으로 자르지 않음) — 남는 공간이 있으면 항상 표시. 로스팅일·패키징일은 항상 고정 표시 — 가로형(40×20·50×30)은 라벨 최하단에 한 줄(2열)로, 카드형(50×60)은 QR 좌측에 "RSTD26.06.29 PKGD26.07.09" 식으로 한 줄에 촘촘히 이어 QR 하단과 맞춰 배치한다. 특히 가장 작은 40×20은 감열 인쇄 가독성을 위해 글자를 키우고 표시 정보량을 줄였다 — 자세한 정보는 QR로 확인. QR은 스캔에 필요한 크기(약 9.4mm)로 3사이즈 모두 동일하게 고정 — 커진 여백은 QR 확대가 아니라 표시 정보량 차이로 쓴다.
4. **관리** — "내 원두 목록"에서 수정·삭제·URL 복사, **CSV 백업 다운로드 / 백업 복원**(내 유저코드 KEY만, 같은 KEY는 백업 내용으로 덮어쓰기 — 실수 삭제·악의적 변조를 백업 시점으로 되돌림).
5. **조회** — 라벨 QR 스캔 → `bnhd.pages.dev/{KEY}` → 원두 카드(테이스팅 노트·기타 정보 포함). 누구나 볼 수 있고 빈 필드는 자동 숨김. 코드 없이 접속하면 랩(`/admin`)으로 안내. 덱(`/deck`)과 조회 카드는 산지(ORIGIN) 문자열을 해시한 고정 색으로 카드 상단 띠를 구분해, 여러 산지를 한눈에 구별할 수 있다(라벨 인쇄 색상과는 무관한 화면 전용 표시).

## 구조

Cloudflare Pages 프로젝트 하나에 D1(`bnhd-v2`)과 R2(`bnhd-logos`)가 붙은 단일 서비스다.

저장소 배치·API 라우트·D1 테이블은 저장소에서 생성되는 **[STRUCTURE.md](STRUCTURE.md)** 에 있다.
작업 시 지켜야 할 원칙과 함정은 [CLAUDE.md](CLAUDE.md).

- 쓰기(등록·수정·삭제·백업·복원·로고)는 **세션 토큰** 인증(`POST /api/login`으로 발급, 90일 만료, 서버엔 SHA-256 해시만 저장), 읽기(QR 조회)는 공개. 브라우저는 암호를 저장하지 않고 세션 토큰만 보관하며, 구버전이 저장해 둔 암호는 첫 방문 시 세션으로 자동 교환된다. 레거시 `Bearer 유저코드:암호` 인증도 이행기 동안 동작.
- 암호는 탈취돼도 무방한 편의용(무단 등록·수정 방지 수준) — PBKDF2 해시만 저장 (구형 SHA-256 해시는 로그인 시 자동 업그레이드). **인증 실패는 D1 기반 rate limit**(유저코드당 10회/10분, IP당 30회/10분 — 초과 시 429)으로 4자리 암호 전수 대입을 차단
- 복구키는 계정 복구 전용 고엔트로피 값 — 해시만 저장, 사용 시(재설정 성공 시) 자동 회전(1회용)
- 수정·삭제·복원은 KEY 앞 4자리가 내 유저코드인 원두만 가능
- CSV 내보내기는 스프레드시트 수식 인젝션 가드(`'` 접두) 적용, 복원 시 자동 복원

## 운영

- **배포(자동)**: `main`과 `deploy` 푸시 모두 GitHub Actions(`.github/workflows/deploy.yml`)가 lint·테스트(Vitest)·랩 빌드 + **Playwright e2e 통과**를 게이트로 `wrangler pages deploy`를 실행하되, 도착지가 다르다.
  - `main` 푸시 → **프리뷰** `preview.bnhd.pages.dev` (개발 중 확인용)
  - `deploy` 푸시 → **프로덕션** `bnhd.pages.dev` (실 서비스 — `main → deploy` PR을 **Create a merge commit**으로 승격)
  - 필요 시 Actions 탭에서 `workflow_dispatch`로 수동 재배포도 가능.
  - 최초 1회 리포 secret 등록 필요: `CLOUDFLARE_API_TOKEN`(Pages 편집 권한), `CLOUDFLARE_ACCOUNT_ID` — 둘 중 하나라도 누락되면 배포 잡이 실패한다(테스트 잡은 별개로 통과).
- **프로덕션 승격 절차** — `main`을 `deploy`로 올릴 때 순서를 지킨다. 배포가 먼저 나가면 스키마가 없어 깨진다.
  1. **원격 D1에 미적용 마이그레이션이 있는지 먼저 확인한다.** 아래 "스키마" 항목의 목록과 대조:
     `npx wrangler d1 execute bnhd-v2 --remote --command "PRAGMA table_info(beans);"`,
     `npx wrangler d1 execute bnhd-v2 --remote --command "SELECT name FROM sqlite_master WHERE type='table';"`
     — v1.2.0 승격 때 `r2_usage`·`coffee_name` 둘 다 빠져 있었다. 마이그레이션은 전부 비파괴라
     **배포 전에 미리 적용해도 안전하다** (구 코드는 새 컬럼·테이블을 모르고도 동작한다).
  2. 승격 → `deploy` 푸시가 프로덕션 배포를 트리거한다.
  3. 배포된 커밋에 **버전 태그**를 달고 **릴리스 노트**를 쓴다 (아래 "릴리스").
  4. 라이브에서 조회·로그인·등록·로고 저장을 한 번씩 확인한다.
- **릴리스** — 버전은 **프로덕션에 나간 단위**다. `main` 병합이 아니라 `deploy` 승격 시점에 붙으므로
  한 릴리스가 여러 변경을 묶는다. semver를 쓰되 판단 기준은 **사용자·API 관점**이다 —
  필드나 기능 추가는 minor, API 계약 파괴는 major(QR 호환 때문에 사실상 없다), 저장소 구조 변경만으로는
  올리지 않는다. 태그는 실제 배포된 커밋에 달고(`git tag -a vX.Y.Z <sha>`), 노트는 GitHub Releases에 쓴다
  (README "주요 변경" 표에는 한 줄만 남기고 전문은 릴리스로). 버전을 코드에 적지는 않는다 —
  루트 `package.json`은 `private`이고 태그가 단일 소스다.
- **브랜치 보호 규칙** (GitHub Settings > Rules > Rulesets):
  - `main` — PR 없이 직접 push 허용, 삭제만 방지(Restrict deletions).
  - `deploy` — PR 필수 + **병합 방식은 merge commit만** + 필수 검사(`unit`·`e2e`) + 삭제·강제푸시 방지.
    승격 PR은 반드시 **Create a merge commit**으로 병합한다 — Squash·Rebase는 규칙이 막는다.
  - **왜 merge commit인가 (Squash를 쓰면 안 되는 이유).** squash와 rebase는 새 커밋 객체를 만들어
    `main`의 커밋을 `deploy`의 조상으로 남기지 않는다. 그래서 승격을 반복하면 두 브랜치의
    merge-base가 옛날에 묶인 채 굳고, 다음 승격 PR이 **내용 다툼이 아닌 `add/add` 충돌 수십 건**으로
    막힌다 — v1.2.0 승격 때 충돌 36건으로 실제로 겪었고 `deploy`를 `main`과 같은 커밋으로 맞춰
    (계보 리셋) 풀어야 했다. merge commit은 부모가 둘이라 `main`의 HEAD가 그대로 조상이 되고,
    다음 승격의 merge-base가 이번 릴리스 지점이 되어 새 변경만 깔끔하게 보인다.
    릴리스마다 커밋이 하나씩 찍히므로 `git log deploy --first-parent`가 곧 릴리스 목록이다.
    `deploy`는 rebase·bisect 대상이 아니라 "지금 라이브가 무엇인가"를 가리키는 포인터라
    선형 이력이 사줄 게 없다.
  - ⚠️ **필수 검사의 "Require branches to be up to date before merging"은 켜지 않는다.**
    켜면 승격이 영구히 막힌다 — merge commit 방식에서는 병합 후 `deploy`에 `main`에 없는 병합
    커밋이 생기는데, 이 옵션은 head(`main`)가 base(`deploy`)의 최신 상태를 포함할 것을 요구하므로
    매번 `deploy`를 `main`으로 역병합해야 하고 그게 방금 없앤 계보 꼬임을 되살린다.
  - 승인 수는 0이다. 1인 저장소라 올릴 수 없다 — GitHub은 자기 PR 자가승인을 허용하지 않아
    1로 두면 승격 자체가 불가능해진다.
- **의존성 갱신**: `.github/dependabot.yml`이 매주 월요일 `main`으로 PR을 연다(액션은 월 1회). 자동 병합은 켜지 않는다 — `main` 푸시가 프리뷰 배포를 트리거하므로 사람이 검사 결과를 보고 병합한다. Cloudflare 툴체인(`wrangler`·`miniflare`·`@cloudflare/*`)은 한 PR로 묶여 오고, `hono`·`drizzle-orm`·`zod` 같은 런타임 의존성은 API 계약에 닿으므로 개별 PR로 온다.
- **배포(수동/로컬)**: `npx wrangler pages deploy public` — 긴급 핫픽스나 로컬 검증용, 정상 경로는 위 자동 배포.
- **초대코드**: Cloudflare **secret**으로 관리 — `npx wrangler pages secret put INVITE_CODE` (교체도 동일, 저장소에 커밋하지 않는다)
- **무차별 대입 완화**: 코드 레벨 rate limit 내장(인증 실패 유저코드당 10회/10분·IP당 30회/10분 → 429, D1 카운터). Cloudflare 대시보드 Rate Limiting 룰은 추가 방어층으로 선택 적용.
- **R2 비용 백스톱**: 로고 저장(`PUT /api/logos`)에 서비스 전역 물리적 상한 내장(`packages/api/src/lib/budget.ts`) — 월간 R2 쓰기 10만 회·R2 저장 로고 2만 개 초과 시 503으로 저장 거부(무료 티어를 넘겨 과금되기 전에 차단). 삭제는 무과금이라 제한하지 않는다(한도에 걸려도 삭제로 공간 확보 가능). 코드 밖 안전망으로 **Cloudflare 대시보드 → R2/Billing 사용량 알림**을 별도로 설정할 것(대시보드 예산은 서비스를 멈추지 않는 알림뿐이라 코드 백스톱이 실제 상한).
- **DB 백업 (3중 안전망)**:
  1. **D1 Time Travel** — 최근 30일 내 임의 시점 복구: `npx wrangler d1 time-travel info bnhd-v2`로 북마크 확인, `npx wrangler d1 time-travel restore bnhd-v2 --timestamp=<unix|ISO>`로 복구.
  2. **자동 덤프** — `.github/workflows/backup.yml`이 매일 04:17 KST에 `wrangler d1 export`를 실행해 Actions artifact(30일 보관)로 저장. 복구: artifact의 `bnhd-v2-backup.sql`을 받아 `npx wrangler d1 execute bnhd-v2 --remote --file=bnhd-v2-backup.sql` (덤프는 CREATE+INSERT 전체 스냅샷 — 빈 DB 기준. 기존 DB 위 복구는 Time Travel을 먼저 고려). 토큰에 D1 권한이 없어 잡이 실패하면 `CLOUDFLARE_API_TOKEN`에 D1:Edit 권한 추가.
  3. **사용자 셀프 백업** — 각자 랩에서 CSV 내보내기/복원.
  (R2 로고 원본은 백업 대상 제외 — 유실 시 사용자가 재업로드하는 트레이드오프 수용, D1 레거시 행은 덤프에 포함됨)
- **서버 로그**: 5xx는 구조화 JSON(`level/msg/stack/method/path`)으로 `console.error` — 실시간 확인은 `npx wrangler pages deployment tail`, 또는 대시보드 > Pages > bnhd > Real-time Logs.
- **스키마**: 새 환경은 `db/schema.sql` 하나로 생성. 기존 DB에는 미적용 마이그레이션만 순서대로:
  `migrate_add_columns.sql` → `migrate_producer_lot.sql` → `migrate_washing_station.sql` → `migrate_logos.sql` → `migrate_archived.sql` → `migrate_sessions.sql` → `migrate_logos_r2.sql` → `migrate_r2_usage.sql` → `migrate_coffee_name.sql`
  (`migrate_drop.sql`은 초기 재생성용 기록 — 실행 금지)
  적용: `npx wrangler d1 execute bnhd-v2 --remote --file=db/migrate_logos.sql` (`db/` 아래에 있다)
- **데모 갱신**: `npx wrangler d1 execute bnhd-v2 --remote --file=db/seed.sql` (데모 원두는 INSERT OR REPLACE라 재실행으로 갱신)

## 로컬 개발

**Node 22 이상**이 필요하다 (루트 `package.json`의 `engines`) — wrangler가 Node 20에서
실행을 거부해 아래 `wrangler` 명령과 `npm run e2e`가 모두 시작하지 못한다.

```bash
npm ci                                                        # 루트에서 1회 (npm workspaces)
npx wrangler d1 execute bnhd-v2 --local --file=db/schema.sql  # 로컬 D1 초기화 (1회)
npx wrangler d1 execute bnhd-v2 --local --file=db/seed.sql    # 데모 계정/원두 (선택)
npx wrangler pages dev public --binding INVITE_CODE=test \
  --d1 DB=f6b539d0-3394-4011-9f00-f3961d549409 \
  --r2 LOGOS=bnhd-logos                                     # http://localhost:8788
# (--d1/--r2 플래그: wrangler 4.x의 pages dev가 wrangler.toml의 바인딩을 붙여주지 않아 명시 필요)
# /admin(랩)을 로컬에서 띄우려면 먼저 npm run build -w @bnhd/lab
```

- 데모 계정: 유저코드 `DEMO` / 암호 `0000`
- 랩을 고치는 중이라면 `npm run dev -w @bnhd/lab`(Vite HMR)를 쓰고, 이때 위 wrangler는
  **`--port 8790`**으로 띄운다 — Vite 프록시가 8790을 본다. 8788은 e2e 전용이다.
- 검증: 저장소 루트에서 `npm run check` (lint + typecheck + test + check:docs) — 커밋 전 필수.
  `npm run e2e`는 Playwright가 wrangler를 직접 띄우므로 별도 서버 기동이 필요 없다.

## 주요 변경

세부 이력은 커밋 히스토리를 본다. 여기에는 서비스의 성격이 바뀐 지점만 남긴다.

**버전**은 프로덕션에 실제로 나간 단위다 — `main`에 병합된 시점이 아니라 `deploy`로 승격된
시점에 붙으므로, 한 릴리스가 여러 행을 묶기도 한다. 전문은 [릴리스 노트](../../releases)에 있다.

| 버전 | 시기 | 무엇이 달라졌나 |
|---|---|---|
| [v0.1.0](../../releases/tag/v0.1.0) | 2026-07-03 | **v1 첫 배포** — 구글시트를 DB로 쓰는 정적 웹앱 + 파이썬 라벨 생성기. QR을 대문자 경로형 URL로 인코딩해 25×25 유지 |
| [v0.2.0](../../releases/tag/v0.2.0) | 2026-07-07 | **v2 제로베이스 재설계·교체** — Cloudflare D1 + Pages Functions로 재구축. 인증을 유저코드+4자리 암호로, 라벨 렌더러를 단일화하고 jsQR 브라우저 검증 도입 |
| [v1.0.0](../../releases/tag/v1.0.0) | 2026-07-08 | **개인 서비스로서의 기본기** — 오프라인 복구키, 라벨 3사이즈, 로스터리 로고 서버 저장, CSV 백업·복원, PBKDF2 해시, SSRF 가드, 단위 테스트 + CI, `deploy` 브랜치 승격 방식 |
| [v1.0.0](../../releases/tag/v1.0.0) | 2026-07-09~10 | **라벨·카드 표시 체계 확립** — 표시 우선순위(부제목 > 스펙 > 노트)와 자동 드롭 규칙, 감열 인쇄 가독성 대응, 덱을 월렛 카드 인터랙션으로 재구현, 보관(숨기기) 기능 |
| [v1.1.0](../../releases/tag/v1.1.0) | 2026-07-12~13 | **실서비스 전환 (Phase 0~4)** — 모노레포 + TypeScript + Hono + Drizzle 이식, 세션 토큰 인증과 D1 rate limit, 랩을 React로 재작성해 `/admin` 교체, 로고를 R2로 이전, 구조화 로깅, D1 자동 백업, Playwright e2e를 배포 게이트로 |
| [v1.2.0](../../releases/tag/v1.2.0) | 2026-07-19 | **원두 식별자 체계** — 헤드라인을 국가 + 최세부 장소로 조합하고, 시그니쳐·블렌드명을 위한 `coffee_name` 필드 신설 |
| [v1.2.0](../../releases/tag/v1.2.0) | 2026-07-24 | **R2 요금 백스톱** — 로고 저장에 서비스 전역 물리 상한을 걸어 무료 티어 초과 과금을 코드 레벨에서 차단 |
| [v1.2.0](../../releases/tag/v1.2.0) | 2026-07-29~30 | **문서 체계 정리** — 저장소 구조를 코드에서 생성([STRUCTURE.md](STRUCTURE.md))하고 문서 참조를 자동 검증. v1 잔재를 걷어내고 `v2/` 디렉터리를 루트로 평탄화 |

## 로드맵 / 남은 작업

남은 작업·백로그는 README가 아니라 **GitHub Issues**에서 관리한다.

### 👉 [열린 이슈 전체 보기](../../issues)

**번호를 여기 나열하지 않는다.** 예전엔 11개를 손으로 적어뒀는데 그중 7개가 닫힌 뒤에도 그대로
남아 있었다 — 목록의 절반 이상이 거짓이 되고서야 발견했다. `check:docs`는 경로만 검증하고 이슈가
살아 있는지는 보지 않으므로, 이 종류의 낡음은 기계가 잡아주지 못한다. 그래서 목록 대신 링크만 둔다.

저장소 안에 짝이 되는 파일이 있어 여기 적어둘 값이 있는 것만 예외로 남긴다:

- 🎨 [#32 디자인 리뉴얼](../../issues/32) — 작업 지침·진행 추적은 [DESIGN_RENEWAL_PLAN.md](DESIGN_RENEWAL_PLAN.md), 브랜치는 `design/visual-renewal-32`
