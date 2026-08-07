# Bean-Hoarder 저장소 구조

> **이 파일은 생성된다 — 손으로 고치지 말 것.** `npm run gen:structure`가 저장소에서 직접
> 읽어 만든다. 파일 목록은 `git ls-files`, 각 항목의 설명은 그 파일의 머리 주석, API 라우트는
> `packages/api/src/app.ts`, D1 테이블은 `db/schema.sql`에서 온다. 설명을 바꾸려면 해당
> 파일의 머리 주석을 고치고 다시 생성한다.
>
> 원칙·함정은 [CLAUDE.md](CLAUDE.md), 사용법·운영 절차는 [README.md](README.md).

**정적 페이지** — 빌드 없이 브라우저가 그대로 받는 파일. Cloudflare Pages가 서빙한다.

| 경로 | 역할 |
|---|---|
| `public/admin/` | 랩(등록·관리 화면) — apps/lab 빌드 산출물. gitignore이며 CI가 배포 직전에 만든다. |
| `public/admin/assets/index-rRXmEFtD.js` | — |
| `public/admin/index.html` | LAB |

**서버** — Pages Functions 진입점. 실제 라우팅은 @bnhd/api가 맡는다.

| 경로 | 역할 |
|---|---|
| `functions/api/[[path]].ts` | Cloudflare Pages Functions 어댑터 — 라우팅·로직은 @bnhd/api(Hono, packages/api)로 이전됐다. |

**워크스페이스** — npm workspaces. 로직의 단일 소스는 전부 여기에 있다.

| 경로 | 역할 |
|---|---|
| `apps/lab/`<br>`@bnhd/lab` | 랩(등록·관리 화면)의 React 진입점 — base /admin/으로 빌드되어 public/admin에 올라간다. |
| `apps/web/`<br>`@bnhd/web` | — |
| `packages/api/`<br>`@bnhd/api` | Bean-Hoarder v2 API — Hono 앱 (Cloudflare Pages Functions에 마운트). |
| `packages/autofill/`<br>`@bnhd/autofill` | 붙여넣은 텍스트에서 원두 정보를 추출하는 휴리스틱 파서. |
| `packages/label/`<br>`@bnhd/label` | 라벨 렌더러 단일 모듈 (@bnhd/label) 미리보기, PNG/SVG 다운로드, QR 검증이 모두 이 코드를 사용한다 (렌더러 이중화 제거). |
| `packages/schema/`<br>`@bnhd/schema` | Bean-Hoarder 도메인 스키마 — 원두 필드의 단일 소스(single source of truth). |

**D1 스키마** — 새 환경은 schema.sql 하나로 만들고, 기존 DB에는 migrate_*.sql을 순서대로 적용한다.

| 경로 | 역할 |
|---|---|
| `db/migrate_add_columns.sql` | 비파괴 마이그레이션: 기존 users/beans 데이터를 보존한 채 신규 컬럼만 추가. |
| `db/migrate_archived.sql` | 비파괴 마이그레이션: 소비 완료 등으로 숨김 처리하는 보관(archived) 상태 컬럼 추가 |
| `db/migrate_coffee_name.sql` | 비파괴 마이그레이션: 시그니쳐·블렌드 네이밍용 커피 이름 컬럼 추가 (라벨/카드 헤드라인 오버라이드) |
| `db/migrate_drop.sql` | v2 인증 모델 변경(토큰 → 유저코드+암호)에 따른 재생성용. |
| `db/migrate_logos_r2.sql` | Phase 3: 로고 저장을 D1 data URL → R2 오브젝트로 이전. |
| `db/migrate_logos.sql` | 2026-07-08: 로스터리 로고 서버 저장 (기기 간 재사용) |
| `db/migrate_producer_lot.sql` | 비파괴 마이그레이션: 생산자/농장, 랏·워싱스테이션 컬럼 추가 |
| `db/migrate_r2_usage.sql` | Phase 4: R2 비용 백스톱 — 서비스 전역 월간 R2 쓰기(Class A) 카운터. |
| `db/migrate_sessions.sql` | Phase 2 인증 업그레이드: 세션 토큰 + 인증 시도 rate limit. |
| `db/migrate_washing_station.sql` | 비파괴 마이그레이션: 랏(lot)에서 워싱스테이션을 분리한 컬럼 추가 |
| `db/schema.sql` | — |
| `db/seed.sql` | 데모 계정(유저코드 DEMO, 암호 0000, 복구키 F89E-5079-5A48-3F33-62B0) + 데모 원두 pass_hash는 구형(SHA-256) 포맷 — 첫 로그인 시 서버가 PBKDF2로 자동 업그레이드한다. |

**테스트** — 단위 테스트는 각 패키지 안에 두고, 사용자 동선은 e2e가 실제 서버를 띄워 검증한다.

| 경로 | 역할 |
|---|---|
| `e2e/routing.spec.ts` | 배포 산출물의 라우팅 계약 — 인쇄된 라벨의 QR이 향하는 경로가 살아 있는지 검증한다. |
| `e2e/smoke.spec.ts` | 스모크 e2e — 서비스의 핵심 동선이 실제 브라우저에서 끝까지 동작하는지 확인한다. |

**저장소 유지보수** — 문서를 코드에서 파생시키고, 어긋나면 잡아내는 스크립트.

| 경로 | 역할 |
|---|---|
| `scripts/check-docs.mjs` | 문서가 가리키는 저장소 경로와 npm 스크립트가 실제로 존재하는지 검증한다. |
| `scripts/gen-structure.mjs` | 저장소 구조 문서를 코드에서 파생해 생성한다. |

**API 라우트** — 모두 `/api` 접두. 표시가 없으면 인증 없이 열려 있다.

| 메서드 | 경로 | 인증 |
|---|---|---|
| POST | `/signup` | 공개 |
| POST | `/login` | 공개 |
| DELETE | `/session` | 필요 |
| POST | `/recover` | 공개 |
| GET | `/bean/:key` | 공개 |
| PUT | `/bean/:key` | 필요 |
| DELETE | `/bean/:key` | 필요 |
| PATCH | `/bean/:key/archive` | 필요 |
| POST | `/beans` | 필요 |
| GET | `/beans` | 필요 |
| GET | `/export.csv` | 필요 |
| POST | `/import` | 필요 |
| GET | `/logos` | 필요 |
| PUT | `/logos` | 필요 |
| DELETE | `/logos` | 필요 |
| POST | `/fetch` | 필요 |

**D1 테이블** (`bnhd-v2`)

| 테이블 | 컬럼 |
|---|---|
| `users` | `usercode`, `pass_hash`, `recovery_hash`, `created_at` |
| `beans` | `key`, `usercode`, `roastery`, `origin`, `region`, `producer`, `lot`, `washing_station`, `variety`, `process`, `altitude`, `harvest`, `roast_date`, `package_date`, `net_weight`, `agtron`, `tasting_note`, `memo`, `source_url`, `coffee_name`, `archived`, `created_at` |
| `logos` | `usercode`, `roastery`, `data_url`, `content_type`, `updated_at` |
| `sessions` | `token_hash`, `usercode`, `created_at`, `expires_at` |
| `auth_attempts` | `bucket`, `count`, `reset_at` |
| `r2_usage` | `id`, `month`, `write_count` |
