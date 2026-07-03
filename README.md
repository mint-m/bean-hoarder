# Bean-Hoarder

QR 코드 기반 트레이서빌리티를 갖춘 개인용 커피 원두 소분 라벨링 & 조회 시스템.
40×20mm 라벨을 님봇(NIIMBOT) 프린터로 인쇄하고, QR을 스캔하면 원두 상세 정보가 뜬다.
백엔드 없음, **총 운영 비용 0원** (Cloudflare Pages + Google Sheets 무료 티어).

| | |
|---|---|
| 조회 웹앱 | **[bnhd.pages.dev](https://bnhd.pages.dev)** |
| 관리자 페이지 | **[bnhd.pages.dev/admin.html](https://bnhd.pages.dev/admin.html)** (비공개 링크, 메인 페이지에서 연결 안 됨) |
| 원두 DB | Google Sheets (발행 URL 연동 대기 중 — 현재는 데모 CSV로 동작) |
| 상세 기술 스펙 | [PROJECT.md](PROJECT.md) |

## 이게 뭔가요

원두를 소분할 때마다 라벨을 인쇄하고, 그 QR을 스캔하면 원산지·가공방식·로스팅일·테이스팅 노트 같은 정보가 바로 뜨는 시스템이다. 별도 앱이나 데이터베이스 없이 구글시트 한 장이 원두 DB이고, 정적 웹페이지 한 장이 조회 화면이다. 시트 행, 라벨의 QR, 웹앱의 조회 대상은 모두 `KEY` 하나(예: `BXNQ26-001`)로 연결된다.

```
[구글시트]  ──발행(CSV)──▶  [조회 웹앱]  ◀──스캔──  [라벨 QR]
  원두 DB                    index.html              40×20mm
  (KEY 기준)               (bnhd.pages.dev)        (QR + 코드 병기)
```

## 빠르게 훑어보기

- **키 체계**: `BXNQ` (유저코드 4자리, 고정) + 연도 2자리 + 순번 3자리 → `BXNQ26-001`
- **QR**: 대문자 경로형 URL(`HTTPS://BNHD.PAGES.DEV/BXNQ26-001`)로 인코딩해 알파뉴메릭 모드 유지 → 25×25 모듈, 스캔 안정적
- **라벨 생성**: `py tools/make_label.py --all` — 님봇 인쇄용 203dpi + 미리보기용 320dpi를 함께 렌더링하고, 매 라벨마다 QR을 실제로 디코드해 검증
- **원두 등록**: [admin.html](https://bnhd.pages.dev/admin.html)에서 폼 입력 → KEY 자동 채번 → 라벨/QR 실시간 미리보기 → CSV 행 복사해서 시트에 붙여넣기
- **조회**: `index.html`이 발행된 시트 CSV를 클라이언트에서 직접 파싱해 렌더링 (백엔드 없음)

## 구성 파일

| 파일 | 역할 |
|---|---|
| `index.html` | 조회 웹앱 — QR을 스캔하면 뜨는 화면. `?preview=` 파라미터로 초안 데이터도 렌더링 가능 |
| `admin.html` | 관리자 페이지 — 원두 입력, KEY 채번, QR/라벨 실시간 미리보기, 시각적 디자인 편집기 |
| `tools/make_label.py` | 라벨 SVG/PNG 생성기 (203/320dpi) + QR 디코드 전수 검증 |
| `tools/deploy.ps1` | Cloudflare Pages 재배포 스크립트 |
| `bean_sheet_template.csv` | 구글시트 임포트용 템플릿 겸 로컬 데모 데이터 |
| `logos/` | 로스터리 로고 (파일명이 `ROASTERY` 값과 일치하면 라벨에 자동 표기) |
| `labels/` | 생성된 라벨 산출물 |

## 로컬에서 열어보기

```
py -m http.server 8788
```
- 조회 화면: `http://localhost:8788/?c=BXNQ26-001`
- 관리자 페이지: `http://localhost:8788/admin.html`

## 진행 기록

| 날짜 | 내용 |
|---|---|
| 2026-07-03 | 초기 설계: 키 체계, 라벨 SVG 생성기, 조회 웹앱, 시트 스키마 확정. QR을 대문자 경로형 URL로 바꿔 25×25 모듈(알파뉴메릭 모드) 유지하도록 원안 개선 |
| 2026-07-03 | Bean-Hoarder로 리브랜딩 — 유저코드 5→4자리(`BXNQ`), URL을 `bnhd.pages.dev`로 확정. 라벨 가독성 개선(스펙 그리드 라벨/값 폰트 위계 분리), 정보 우선순위 조정(HARVEST는 웹앱 상세만, 로스터리 필수 표기 + 로고 자동 삽입), 님봇 프린터 대응(203dpi 인쇄용 렌더 추가) |
| 2026-07-03 | GitHub 리포 생성(`mint-m/Bean-Hoarder`, private) 및 Cloudflare Pages 배포(`bnhd.pages.dev`) — wrangler 직접 업로드 방식으로 정식 라이브. 구글시트 생성(발행은 사용자 권한 필요 단계로 대기 중) |
| 2026-07-04 | 관리자 페이지(`admin.html`) 추가 — 데이터 입력 폼, CSV 기반 KEY 자동 채번, 클라이언트 QR 미리보기, 시각적 라벨 디자인 편집기(필드 토글·폰트/QR 크기 조절·로고 업로드), CSV 행/QR 콘텐츠 복사, SVG/PNG 다운로드. `index.html`에 `?preview=` 모드를 추가해 시트에 게시하기 전에 QR이 연결될 상세 페이지를 미리 확인할 수 있게 함 |

## 남은 일

- [ ] 구글시트 "웹에 게시" (사용자가 직접 — 공유/권한 변경은 자동화 대상 아님) → 발행 CSV URL을 `index.html`의 `SHEET_CSV_URL`에 입력 → 재배포
- [ ] 님봇 실제 인쇄 → 폰 카메라 스캔 테스트
- [ ] 로스터리 실제 로고 파일로 교체 (`logos/DANCHE.svg`는 플레이스홀더)

세부 스펙(키 체계 근거, QR 인코딩 계산, 라벨 지오메트리, 배포 절차 전체)은 [PROJECT.md](PROJECT.md)에 정리되어 있다.
