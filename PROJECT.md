# BEAN-HOARDER — 커피 원두 소분 라벨링 & 조회 시스템

QR 코드 기반 트레이서빌리티를 갖춘 개인/테스트용 원두 소분 라벨 시스템.
40×20mm 라벨을 님봇(NIIMBOT) 라벨 프린터로 인쇄하고, QR을 스캔하면 구글시트에 등록된 원두 상세 정보를 조회한다.
**총 운영 비용: 0원** (Cloudflare Pages + Google Sheets 무료 티어).

## 1. 시스템 구성

```
[구글시트]  ──발행(CSV)──▶  [조회 웹앱]  ◀──스캔──  [라벨 QR]
  원두 DB                    index.html              40×20mm
  (KEY 기준)               (bnhd.pages.dev)        (QR + 코드 병기)
```

세 요소가 `KEY` 값 하나로 연결된다.

## 2. 키 체계

```
{유저코드 4자리}{연도 2자리}-{원두순번 3자리}   예: BXNQ26-001
```

- **유저코드 확정: `BXNQ`** (데모 규모에 맞춰 4자리, 혼동 문자 0/O/1/I 제외 난수로 생성, 고정)
- 연도 내 증가, 매년 001 리셋. 고정 9자리라 파싱 단순, URL에 그대로 사용.
- 시트에서 순번 자동화가 필요하면 KEY 열에:
  `="BXNQ26-"&TEXT(ROW()-1,"000")` (행 순서 = 등록 순서 전제. 확정된 키는 값으로 붙여넣기 권장)

## 3. QR 인코딩 (확정 사양)

QR 내용은 **대문자 경로형 URL**:

```
HTTPS://BNHD.PAGES.DEV/BXNQ26-001
```

- 대문자 URL → QR 알파뉴메릭 모드 → **버전 2 (25×25), ECC M**. (`?c=` 쿼리 방식은 바이트 모드라 29×29 필요)
- 도메인은 대소문자 무관, 경로(KEY)는 원래 대문자라 문제 없음.
- 웹앱은 경로형(`/KEY`)과 쿼리형(`?c=KEY`) 둘 다 지원.
- Cloudflare Pages는 `404.html`이 없으면 모든 경로에 `index.html`을 반환(SPA 폴백)하므로 별도 라우팅 불필요.

## 4. 라벨 사양

- **크기**: 40×20mm 벡터 SVG (mm 단위), 1도 흑백
- **프린터**: 님봇 라벨 프린터. B/D 시리즈 인쇄 해상도 203dpi 기준 — 생성기가 **203dpi(인쇄용)와 320dpi(미리보기)** PNG를 둘 다 렌더링하고 각각 QR 실디코드 검증
- **QR**: 우측 9mm (203dpi에서 모듈당 약 2.9px 확보), 25×25 모듈, 콰이엇존 1.3mm, 코드 텍스트 병기
- **폰트 위계**: 스펙 그리드에서 라벨(RSTD 등)은 소형 레귤러, 값은 대형 볼드 모노스페이스로 분리해 가독성 확보
- **넘침 방지**: 모든 텍스트 `textLength` 고정
- **로고**: `logos/{ROASTERY}.svg|png` 파일이 있으면 우상단에 자동 표기 (1도 흑백 이미지 사용. `logos/DANCHE.svg`는 플레이스홀더)

### 정보 계층 (위→아래)

1. 로스터리명 (**필수**, eyebrow) + 로고 (우상단, 선택)
2. 원산지 (헤드라인)
3. 품종 · 가공방식 · 고도
4. 스펙 그리드 2×2: 로스팅일 · 패키징일 / 용량 · 애그트론 (신선도 우선 배치)
5. 테이스팅 노트 (이탤릭)
6. QR + 코드 (우측 하단)

수확시기(HARVEST)는 라벨에서 제외, 웹앱 상세에만 표기. 애그트론 추정치는 `~` 표기 (예: `AGT ~65`).

## 5. 라벨 생성 도구

```
py tools/make_label.py --key BXNQ26-001    # 한 장
py tools/make_label.py --all               # CSV 전체 배치 생성
```

- 입력: `bean_sheet_template.csv` (또는 `--csv`로 구글시트 내보내기 파일 지정)
- 출력: `labels/{KEY}.svg` + `labels/{KEY}_203dpi.png`(님봇 인쇄용) + `labels/{KEY}_320dpi.png`(미리보기)
- 님봇 앱에서 이미지 인쇄 모드로 203dpi PNG를 사용
- 의존성: `py -m pip install segno zxing-cpp pillow resvg-py` (설치 완료)

## 6. 시트 스키마

`bean_sheet_template.csv` 컬럼 그대로 구글시트에 임포트:

`KEY, ROASTERY, ORIGIN, REGION, VARIETY, PROCESS, ALTITUDE, HARVEST, ROAST_DATE, PACKAGE_DATE, NET_WEIGHT, AGTRON, TASTING_NOTE, SOURCE_URL`

- `KEY`가 기준 열. 빈 필드는 웹앱에서 자동 숨김.
- `REGION`, `HARVEST`, `SOURCE_URL`은 라벨엔 없고 웹앱에서만 표시.

## 7. 조회 웹앱 (`index.html`)

정적 HTML 한 장, 백엔드 없음. PapaParse(CDN)로 발행된 시트 CSV를 클라이언트에서 파싱.

- `SHEET_CSV_URL`이 비어 있으면 리포의 `bean_sheet_template.csv`를 읽음 → 시트 연동 전에도 데모 동작
- 코드 없음 / 형식 오류 / 미등록 / 로드 실패 상태 처리 완료
- 로컬 미리보기: `py -m http.server 8788` 후 `http://localhost:8788/?c=BXNQ26-001`

## 8. 배포

| 요소 | 값 |
|---|---|
| GitHub 리포 | https://github.com/mint-m/Bean-Hoarder (private) |
| Cloudflare Pages 프로젝트 | `bnhd` → **https://bnhd.pages.dev (배포 완료)** |
| 원두 DB | Google Sheets (웹에 게시 → CSV) |

- 배포 방식: **wrangler 직접 업로드** (`index.html` + `bean_sheet_template.csv`만 스테이징 — 라벨/도구 파일은 비공개 유지)
- 재배포: `powershell -File tools\deploy.ps1` 또는 인라인으로
  `npx wrangler pages deploy {스테이징폴더} --project-name bnhd --branch main`
- GitHub push 자동 배포(git 연동)로 바꾸려면 Cloudflare 대시보드에서 프로젝트를 다시 만들어야 함 — 데모 단계에선 직접 업로드로 충분
- **도메인 변경 시**: `tools/make_label.py`의 `BASE_URL` 한 줄 수정 후 `--all` 재생성 (알파뉴메릭 모드 이탈 시 스크립트가 에러로 알려줌)

## 9. 운영 체크리스트

- [x] 라벨 생성기 + QR 전수 검증 (203/320dpi)
- [x] 조회 웹앱 상태 처리 및 로컬 검증
- [x] GitHub 리포 생성·push (mint-m/Bean-Hoarder)
- [x] Cloudflare Pages `bnhd` 생성·배포 → https://bnhd.pages.dev 라이브 (경로형/쿼리형 URL 200 확인)
- [ ] 구글시트 생성·발행 → `index.html`의 `SHEET_CSV_URL` 입력 → 재배포
- [ ] 님봇 실인쇄 → 폰 카메라 스캔 테스트
- [ ] 로스터리 실제 로고 파일 교체 (`logos/DANCHE.svg`)

## 10. 확장 아이디어

- 라벨 여러 장을 A4 한 페이지에 배치하는 시트 출력 모드
- 웹앱에 "전체 원두 목록" 뷰 (코드 없이 접속 시)
- Apps Script로 시트에서 행 추가 시 KEY 자동 채번
