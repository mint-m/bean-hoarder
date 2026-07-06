# Bean-Hoarder

여러 로스터리에서 원두를 사 모아 소분·보관하는 **원두 호더**를 위한 라벨링 & 조회 서비스.
40×20mm 라벨을 님봇(NIIMBOT) 프린터로 인쇄하고, QR을 스캔하면 그 원두의 상세 정보가 뜬다.
Cloudflare Pages + Functions + D1 하나로 동작하며 **총 운영 비용 0원**.

| | |
|---|---|
| 조회 (QR 스캔 대상) | **[bnhd.pages.dev](https://bnhd.pages.dev)** — 인증 없음 |
| 스튜디오 (등록·관리) | **[bnhd.pages.dev/admin](https://bnhd.pages.dev/admin)** — 가입/로그인 필요 |
| 데모 | [bnhd.pages.dev/DEMO26-001](https://bnhd.pages.dev/DEMO26-001) |
| 작동 방식 (그래픽 문서) | [v2/HOW_IT_WORKS.html](v2/HOW_IT_WORKS.html) |
| 설계 근거 | [v2/DESIGN.md](v2/DESIGN.md) |

## 사용 흐름

1. **가입** — 운영자에게 받은 초대코드 + 내가 정한 숫자 4자리 암호 → 유저코드(4자리) 자동 발급. 브라우저에 저장되며, 유저코드+암호만 기억하면 어느 기기에서든 로그인.
2. **등록** — 원두 정보를 입력하면 라벨이 실시간 미리보기되고(QR은 렌더링 때마다 203dpi 실디코드 자동 검증), 등록 버튼을 누르면 서버가 KEY(`{유저코드}{연도}-{순번}`)를 채번.
3. **공유·인쇄** — 상세 URL 복사 / QR 이미지 클립보드 복사가 기본 동선, 라벨 PNG(203dpi 님봇·320dpi)·SVG 다운로드는 선택.
4. **관리** — "내 원두 목록"에서 수정·삭제·URL 복사, CSV 백업 다운로드.
5. **조회** — 라벨 QR 스캔 → `bnhd.pages.dev/{KEY}` → 원두 카드. 누구나 볼 수 있고 빈 필드는 자동 숨김.

## 구조

```
bnhd.pages.dev  (Cloudflare Pages 프로젝트 1개)
├── v2/public/            정적 페이지 (index=조회, admin=스튜디오, label.js=라벨 렌더러)
├── v2/functions/api/     서버 코드 — signup / beans(CRUD) / bean/{KEY} / export.csv
└── D1 (bnhd-v2)          users(usercode, pass_hash) · beans(key, roastery, …)
```

- 쓰기(등록·수정·삭제·백업)는 `유저코드:암호` 인증, 읽기(QR 조회)는 공개
- 암호는 탈취돼도 무방한 편의용(무단 등록·수정 방지 수준) — SHA-256 해시만 저장
- 수정·삭제는 KEY 앞 4자리가 내 유저코드인 원두만 가능

## 운영

- **배포**: `cd v2 && npx wrangler pages deploy` (wrangler.toml이 D1 바인딩·초대코드 포함)
- **초대코드 교체**: `v2/wrangler.toml`의 `INVITE_CODE` 수정 후 재배포
- **DB 백업**: `npx wrangler d1 export bnhd-v2 --remote` / 사용자는 각자 CSV 내보내기
- **스키마 변경**: `v2/schema.sql` 수정 → `npx wrangler d1 execute bnhd-v2 --remote --file=schema.sql`
- **라벨 배치 인쇄** (선택): `py tools/make_label.py --all` — KEY 형식·도메인이 동일해 v2에도 그대로 사용 가능 (CSV 백업 파일을 입력으로)

## 진행 기록

| 날짜 | 내용 |
|---|---|
| 2026-07-03 | v1: 구글시트를 DB로 쓰는 정적 웹앱 + 파이썬 라벨 생성기. QR을 대문자 경로형 URL로 인코딩해 25×25 유지. `bnhd.pages.dev` 첫 배포 |
| 2026-07-04 | v1 관리자 페이지(KEY 채번·QR 미리보기·디자인 편집기) 추가 |
| 2026-07-06 | 멀티유저 시도(레지스트리 시트 + Apps Script) 후, **v2 제로베이스 재설계** — Cloudflare D1 + Pages Functions로 재구축, 라벨 렌더러 단일화, jsQR 브라우저 검증 |
| 2026-07-07 | **v2 정식 완성·배포** — 서비스 정의를 "원두 호더 개인용"으로 확정(가입에서 로스터리 제거), 인증을 유저코드+4자리 암호로 교체, 목록·수정·삭제, 상세 URL/QR 이미지 클립보드 복사 추가. `bnhd.pages.dev`에서 v1 교체, 라이브 전 구간 검증. v1 웹 파일은 `legacy/`로 이동 |

## 남은 일

- [ ] 님봇 실제 인쇄 → 폰 카메라 스캔 테스트
- [ ] 첫 실사용자 초대 (초대코드 전달)
