# Bean-Hoarder — 실서비스 전환 마이그레이션 계획

> 제한된 사용자(초대제) 대상 실서비스 전환을 위한 기술 스택 마이그레이션 및 아키텍처 설계 계획.
> 확장성·취업시장 트렌드·유지보수성·AI 하네스(에이전트 작업 효율) 4가지 기준으로 평가했다.
> 서비스는 마이그레이션 기간 내내 무중단으로 운영한다(스트랭글러 패턴 — 점진 교체, 풀 리라이트 아님).

## 1. 현재 구조 평가

취미 프로젝트 기준으로는 상위권. 다만 "잘 만든 개인 도구"와 "실서비스"의 경계에 있고,
그 경계를 넘는 데 필요한 몇 가지가 빠져 있다.

### 유지할 자산

- **순수 로직 분리** — [`v2/functions/api/_lib.js`](v2/functions/api/_lib.js)에 env/request 의존 없는 순수 함수만 모아 테스트 대상으로 분리한 구조.
- **보안 감각** — SSRF 가드(DoH 리졸브 + 리다이렉트 홉별 재검사), CSV 수식 인젝션 가드(라운드트립 보존), PBKDF2 무중단 해시 업그레이드, 서버 채번 + 소유권 검증.
- **의사결정 기록 습관** — [`v2/DESIGN.md`](v2/DESIGN.md)의 "v1의 마찰 → v2의 해법" 표, 트레이드오프 명시.
- **CI/CD 골격** — 테스트 통과 후 배포, `main`→프리뷰 / `deploy`→프로덕션 분리.

### 실서비스 관점의 약점

| # | 문제 | 근거 | 영향 |
|---|---|---|---|
| 1 | 필드 하나 추가에 5곳 이상 수정 | `FIELDS`/`CSV_HEADERS`(`_lib.js`) + `lab.js`의 `FORM_IDS`/`AUTOFILL_INPUT_IDS`/`SPEC_FIELD_INPUT_IDS` + `label.js` 풀 + SQL 마이그레이션 파일. `migrate_producer_lot.sql`, `migrate_washing_station.sql`이 그 흔적 | 스키마 단일 소스 부재 — 필드 추가 시 빠뜨리기 쉬움 |
| 2 | 인증 모델이 실서비스에 부적합 | 4자리 PIN + 매 요청 평문 자격증명 전송 + localStorage 저장, 코드 레벨 rate limiting 없음(대시보드 수동 설정 의존) | "탈취돼도 무방"이라는 전제가 남의 데이터를 맡는 순간 성립하지 않음 |
| 3 | `lab.js` 1,195줄 단일 파일 | 모듈 레벨 가변 상태 + DOM ID 문자열 결합, 타입 없음 | 기능 추가 시 회귀 위험 선형 증가, 리팩토링 안전망 없음 |
| 4 | 라우터/인증/DB 계층 무테스트 | 테스트는 순수 함수(`_lib.js`, `label.js`, `autofill.js`)뿐, 408줄 [`[[path]].js`](v2/functions/api/[[path]].js)는 커버 없음 | 실제 버그가 나는 계층(최근 커밋의 회귀 다수)이 검증 사각지대 |
| 5 | 운영 인프라 부재 | 구조화 로깅/에러 추적 없음, 마이그레이션 추적 테이블 없음(수동 순서 실행), 로고 base64를 D1에 저장 | 장애 대응·관측성 부족, 로고는 R2가 적재적소 |

## 2. 권장 기술 스택

### 채택안 — Cloudflare 유지 + 스택 현대화 (점진 마이그레이션)

| 계층 | 현재 | 전환 | 근거 |
|---|---|---|---|
| 언어 | Vanilla JS | **TypeScript** | 취업시장 사실상 필수. AI 에이전트에 기계 검증 가능한 계약 제공 — 하네스 효율의 1순위 요소 |
| API | Pages Functions if/else 라우터 | **Hono** (Cloudflare Workers) | 미들웨어·타입 안전 라우팅. Cloudflare도 Pages Functions보다 Workers+정적 에셋 방향 권장 |
| 검증 | 수동 `String().trim()` | **Zod** | 원두 필드 스키마를 한 곳에 정의 → 폼·API 검증·CSV 헤더·타입을 전부 여기서 파생 (약점 1 해결) |
| DB | D1 + 수동 SQL | D1 유지 + **Drizzle ORM** | 마이그레이션 자동 생성·추적(drizzle-kit), 타입이 스키마에서 파생. 엣지 환경 표준 |
| 프론트 | Vanilla + DOM ID | **React + Vite** (lab/deck만) | 취업시장 최대 키워드. 조회 페이지(index)는 QR 스캔 대상이라 가볍게 유지 |
| 인증 | PIN 4자리 평문 전송 | **세션 + 패스키(WebAuthn)**, PIN은 이행기 폴백 | 초대제 소규모 서비스에 UX·보안 모두 최적, 이력서 차별화 포인트 |
| 스토리지 | 로고 base64 in D1 | **R2** | 적재적소, 무료 티어 충분 |
| 테스트 | `node --test` (순수 함수만) | **Vitest + @cloudflare/vitest-pool-workers** + Playwright 스모크 | 실제 워커 런타임에서 API 통합 테스트 (약점 4 해결) |
| 린트 | 없음 | **Biome** | 초고속 단일 도구, 에이전트 즉각 피드백 루프 |

이 안의 장점: 운영비 0원 유지, 서비스 무중단 점진 전환 가능, 이력서 키워드
(TypeScript, React, Hono, Drizzle, Zod, Vitest, CI/CD, Cloudflare edge) 대부분 확보.

### 대안 — Next.js + PostgreSQL 풀 리라이트 (미채택, 판단 기준만 기록)

Next.js(App Router) + Neon/Supabase + Vercel은 국내 채용공고 키워드 매칭이 가장 강하지만
인프라 전면 교체라 전환 리스크가 크고, 지금 코드의 자산(라벨 엔진, SSRF 가드 등)을 옮기는 비용이 든다.

**판단 기준**: 목표가 프론트엔드 직군 포트폴리오 간판이면 Next.js 리라이트를 별도 프로젝트로,
백엔드/풀스택 지향이거나 서비스 지속 운영이 우선이면 채택안(Cloudflare 현대화)을 선택한다.
하나의 프로젝트에 모든 키워드를 욱여넣지 않는다.

## 3. 단계별 로드맵

> **진행 상황** (2026-07-12): Phase 0 ✅ / Phase 1 ✅ (배포 타깃은 "Pages 유지 + Hono를 Pages
> Functions에 마운트"로 확정 — bnhd.pages.dev 도메인·QR·CI 보존, Hono 앱은 런타임 중립이라
> 추후 Workers 이전은 설정 변경만으로 가능) / Phase 2 ✅ **범위 조정**: 세션 토큰 + D1 기반
> rate limit 먼저 배포하고 패스키(WebAuthn)는 후속 라운드로 분리 (사용자 결정), Turnstile은
> 코드 레벨 rate limit이 커버해 보류 / Phase 3 ✅ — React lab을 /lab 병행 배포로 검증한 뒤
> **/admin을 React 앱으로 교체**, 구 admin.html·lab.js·label.js·autofill.js·vendor/qrcode.js 제거.
> 로고 R2 이전 완료(사용자 결정, bnhd-logos 버킷). 이 과정에서 원격 D1에 미적용 상태였던
> migrate_logos.sql·migrate_archived.sql도 발견·적용됨 / Phase 4 예정.

### Phase 0 — 기반 ✅

- 모노레포 구조: `apps/worker`(API) · `apps/lab`(React) · `packages/schema`(Zod 필드 정의) · `packages/label`(라벨 엔진, 이미 순수 모듈이라 거의 그대로 이동)
- TypeScript + Biome + Vitest 셋업, 기존 테스트 3종(`tests/*.test.mjs`) 이식

### Phase 1 — API 이식 (핵심 단계) ✅

- Hono로 기존 API 계약을 **그대로** 1:1 이식 — 기존 프론트가 수정 없이 계속 동작해야 함
- `packages/schema`에 Zod 스키마 정의 → `FIELDS`/`CSV_HEADERS`/검증 로직 전부 여기서 파생
- Drizzle 스키마 도입, 기존 D1 테이블 구조는 변경 없이 유지
- vitest-pool-workers로 signup→등록→조회→수정→백업/복원 전 경로 통합 테스트 작성
  — 이후 모든 단계의 회귀 안전망

### Phase 2 — 인증 업그레이드 ✅ (세션+rate limit / 패스키는 후속)

- 세션 토큰 도입(자격증명 매 요청 전송 중단), 패스키 등록 유도 + PIN은 이행기 폴백
- Workers Rate Limiting binding(무료) 코드 레벨 적용 + 가입 단계 Turnstile
- 사용자가 소수인 지금이 인증을 갈아엎을 적기 — 100명 규모 이후엔 훨씬 어려움

### Phase 3 — 프론트 전환

- `lab.js`를 React 컴포넌트로 분해(폼/미리보기/목록/로고/백업 단위)
- `packages/schema`에서 폼 필드를 파생하면 `FORM_IDS`류 매핑 테이블 소멸
- 조회 페이지(`index.html`)는 QR 스캔 대상이라 React화하지 않고 가볍게 유지
- 로고 저장을 R2로 이전

### Phase 4 — 운영 준비

- Workers Logs/Sentry 연동, 구조화 로깅
- D1 Time Travel(30일 시점 복구) 확인 + R2 정기 덤프(cron trigger)
- Playwright 스모크(가입→등록→스캔 조회)를 CI에 추가, 커스텀 도메인 적용

## 4. AI 하네스 적용 용이성 — 선택 근거

에이전트 작업 효율은 프레임워크가 아니라 **피드백 루프의 속도와 신뢰도**로 결정된다.

1. **타입 + Zod = 기계 검증 가능한 계약** — 에이전트 변경이 틀리면 `tsc`가 즉시 알려줌 (현재는 브라우저 확인 필요)
2. **통합 테스트 = 자가 검증 수단** — "고쳤다"는 주장 대신 테스트로 증명. 최근 회귀 버그(로고 렌더 순서, 중복 렌더)류는 이걸로 예방 가능한 유형
3. **필드 스키마 단일화** — "필드 추가 시 5곳 수정"은 에이전트가 더 잘 빠뜨리는 함정. 파생 구조로 바꾸면 함정 자체가 소멸
4. **파일 크기 축소** — 1,200줄 파일은 에이전트 편집 단위로도 큼. 컴포넌트 분해가 곧 하네스 최적화
5. **CLAUDE.md 작성** — 명령어(로컬 실행·테스트·배포), 아키텍처 지도, 컨벤션, 금지 사항(`migrate_drop.sql` 실행 금지 등)을 명시. `DESIGN.md` 스타일을 그대로 옮기면 됨
