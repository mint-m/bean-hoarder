# BEAN-HOARDER v1 — 커피 원두 소분 라벨링 & 조회 시스템 (구버전 기록)

> **이 문서는 v1(구글시트 기반) 기록용입니다.** 현재 라이브 서비스는 v2(Cloudflare D1 + Functions)이며
> [README.md](README.md)와 [v2/DESIGN.md](v2/DESIGN.md)를 참고하세요. v1 웹 파일은 `legacy/`에 보존.
> 라벨 사양(§4)과 `legacy/make_label.py`(§5)는 v2에서도 그대로 유효합니다.

QR 코드 기반 트레이서빌리티를 갖춘 개인/테스트용 원두 소분 라벨 시스템.
40×20mm 라벨을 감열 라벨 프린터로 인쇄하고, QR을 스캔하면 구글시트에 등록된 원두 상세 정보를 조회한다.
**총 운영 비용: 0원** (Cloudflare Pages + Google Sheets 무료 티어).

## 1. 시스템 구성

```
[구글시트]  ──발행(CSV)──▶  [조회 웹앱]  ◀──스캔──  [라벨 QR]
  원두 DB                    index.html              40×20mm
  (KEY 기준)               (bnhd.pages.dev)        (QR + 코드 병기)
```

세 요소가 `KEY` 값 하나로 연결된다.

## 2. 키 체계와 유저코드 발급·관리

```
{유저코드 4자리}{연도 2자리}-{원두순번 3자리}   예: BXNQ26-001
```

- 연도 내 증가, 매년 001 리셋. 고정 9자리라 파싱 단순, URL에 그대로 사용.
- **유저코드 발급**: `admin.html`의 "새 코드 생성" 버튼 — 혼동 문자(0/O/1/I)를 뺀 31자 문자셋에서 `crypto.getRandomValues`로 4자리 생성 (조합 약 92만 개, 100명 규모에서 충돌 확률 무시 가능. 충돌 시 레지스트리 등록 단계에서 걸러짐).
- **유저코드 관리**: 운영자가 관리하는 **레지스트리 시트** 한 장 (`registry_template.csv` 스키마: `USERCODE, CSV_URL, OWNER, STATUS`). 사용자는 자기 시트를 만들어 웹에 게시하고, 유저코드와 발행 CSV URL을 운영자에게 알려 행 하나로 등록. `STATUS`를 `disabled`로 바꾸면 해당 사용자의 QR 조회가 차단됨(탈퇴/오남용 대응). 운영자 계정(BXNQ)은 첫 행.
- 유저코드는 브라우저 localStorage에 저장되어 admin.html 재방문 시 유지됨.

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
- **프린터**: 감열 라벨 프린터 (인쇄 해상도 203dpi 기준) — 생성기가 **203dpi(인쇄용)와 320dpi(미리보기)** PNG를 둘 다 렌더링하고 각각 QR 실디코드 검증
- **QR**: 우측 9mm (203dpi에서 모듈당 약 2.9px 확보), 25×25 모듈, 콰이엇존 1.3mm, 코드 텍스트 병기
- **폰트 위계**: 스펙 그리드에서 라벨(RSTD 등)은 소형 레귤러, 값은 대형 볼드 모노스페이스로 분리해 가독성 확보
- **넘침 방지**: 모든 텍스트 `textLength` 고정
- **로고**: `logos/{ROASTERY}.svg|png` 파일이 있으면 우상단에 자동 표기 (1도 흑백 이미지 사용. `logos/DANCHE.svg`는 플레이스홀더)

### 정보 계층 (위→아래)

1. 로스터리명 (**필수**, eyebrow) + 로고 (우상단, 선택)
2. 메인 식별자 (헤드라인) — 국가 + 가장 세부 장소(워싱스테이션>생산자>지역)[+ 랏], 또는 시그니쳐/블렌드명(커피 이름)이 있으면 그것으로 대체 (`@bnhd/label`의 `buildHeadline`)
3. 향미·정체성 (2순위): 가공 · 품종
4. 스펙 그리드: 로스팅일 · 패키징일 / 용량 등 (신선도 우선 배치), 고도·수확 등 전문 정보는 3순위
5. 테이스팅 노트 (이탤릭) — 값이 있으면 **항상 표시**(공간 부족 시 3순위 스펙보다 우선해 남김)
6. QR + 코드 (우측 하단)

수확시기(HARVEST)는 라벨에서 제외, 웹앱 상세에만 표기. 애그트론 추정치는 `~` 표기 (예: `AGT ~65`).

## 5. 라벨 생성 도구

```
py legacy/make_label.py --key BXNQ26-001    # 한 장
py legacy/make_label.py --all               # CSV 전체 배치 생성
```

- 입력: `bean_sheet_template.csv` (또는 `--csv`로 구글시트 내보내기 파일 지정)
- 출력: `labels/{KEY}.svg` + `labels/{KEY}_203dpi.png`(인쇄용) + `labels/{KEY}_320dpi.png`(미리보기)
- 프린터 전용 앱에서 이미지 인쇄 모드로 203dpi PNG를 사용
- 의존성: `py -m pip install segno zxing-cpp pillow resvg-py` (설치 완료)

## 6. 시트 스키마

`bean_sheet_template.csv` 컬럼 그대로 구글시트에 임포트:

`KEY, ROASTERY, ORIGIN, REGION, VARIETY, PROCESS, ALTITUDE, HARVEST, ROAST_DATE, PACKAGE_DATE, NET_WEIGHT, AGTRON, TASTING_NOTE, SOURCE_URL`

- `KEY`가 기준 열. 빈 필드는 웹앱에서 자동 숨김.
- `REGION`, `HARVEST`, `SOURCE_URL`은 라벨엔 없고 웹앱에서만 표시.

## 7. 조회 웹앱 (`index.html`)

정적 HTML 한 장, 백엔드 없음. PapaParse(CDN)로 발행된 시트 CSV를 클라이언트에서 파싱.

- **멀티유저 모드**: `REGISTRY_CSV_URL`에 레지스트리 시트의 발행 CSV를 연결하면, 스캔된 KEY의 앞 4자리(유저코드)로 레지스트리에서 그 사용자의 `CSV_URL`을 찾아 조회. 사용자가 늘어도 웹앱 재배포 불필요 — 레지스트리에 행만 추가하면 됨. 조회당 CSV 2회 fetch로 여전히 백엔드 0원.
- 단일 사용자 모드: `SHEET_CSV_URL`에 발행 CSV를 직접 입력 (레지스트리 생략).
- 둘 다 비어 있으면 리포의 `bean_sheet_template.csv`를 읽음 → 시트 연동 전에도 데모 동작
- 코드 없음 / 형식 오류 / 미등록 / 로드 실패 상태 처리 완료
- `?preview=<base64>` 파라미터로 초안 데이터를 직접 렌더링 (게시 전 상세 페이지 확인용, `admin.html`이 사용)
- 로컬 미리보기: `py -m http.server 8788` 후 `http://localhost:8788/?c=BXNQ26-001`

## 7.5 관리자 페이지 (`admin.html`)

원두 데이터 입력부터 시트 업로드, 라벨/QR 미리보기, 디자인 조정까지 브라우저 한 화면에서 처리하는 도구. 백엔드 없음, `index.html`과 같은 방식(정적 HTML + CDN 라이브러리)으로 동작.

- **내 설정 (localStorage 저장)**: 유저코드, 내 시트 발행 CSV URL, 업로드 URL(Apps Script)을 브라우저에 고정 저장 — 재방문 시 재입력 불필요. "새 코드 생성" 버튼으로 유저코드 발급.
- **KEY 자동 채번**: 설정된 CSV(비우면 데모 템플릿)를 읽어 같은 연도의 최대 순번을 찾고 다음 번호를 제안.
- **시트로 업로드**: 설정된 Apps Script 웹 앱 URL로 입력한 행을 POST → 시트에 자동 추가 (KEY 형식·중복·필수값은 스크립트가 검증). 스크립트 원본과 설치법은 `legacy/apps_script.gs` 주석 참고 — 시트마다 1회, 약 2분 소요. URL 미설정 시 안내 메시지.
- **CSV 다운로드**: 내 시트의 현재 데이터 + 지금 입력한 행을 병합해 `bean_sheet_{유저코드}.csv`로 저장 (백업·재임포트용, BOM 포함이라 엑셀에서도 한글 정상).
- **QR 미리보기**: `qrcode-generator`(CDN)로 즉시 렌더링, 알파뉴메릭 모드 강제로 25×25 유지, 벗어나면 경고. 최종 인쇄용 전수 검증은 여전히 `legacy/make_label.py`(zxing 디코드) 담당.
- **시각적 디자인 편집기**: 서브라인 항목(기본: 지역·가공 / 옵션: 품종·고도), 스펙 그리드(기본: RSTD·PKGD·NET / 옵션: AGT·ALT, 최대 4개 — HARV는 라벨 옵션에서 제외, 웹앱 상세 전용), 로고 표시. 사이즈 조정(헤드라인·스펙값·QR 크기)은 접힌 "펼치기" 안에 숨김.
- **상세 페이지 초안 미리보기**: 입력 중인 데이터를 `index.html?preview=`로 새 탭에 열어 게시 전 확인. "실제 배포 링크 열기"는 게시 후 검증용.
- **내보내기**: CSV 행 복사, SVG/PNG(203·320dpi) 다운로드, 로고 파일명 안내(`logos/{ROASTERY}.svg|png`).
- 로컬: `http://localhost:8788/admin.html`. 배포본: `bnhd.pages.dev/admin.html` (메인에서 링크되지 않은 URL).

## 7.6 멀티유저 운영 (100명 규모, 비용 0원 유지)

```
사용자별:  [내 구글시트] ←Apps Script── admin.html (입력·업로드·라벨)
운영자:    [레지스트리 시트]  USERCODE → CSV_URL 매핑
조회:      index.html — KEY 앞 4자리로 레지스트리에서 시트를 찾아 렌더링
```

- **온보딩 절차 (사용자당 1회, 운영자 작업은 행 1개 추가)**
  1. 사용자: admin.html에서 유저코드 생성 → 구글시트 새로 만들어 `bean_sheet_template.csv` 헤더 임포트 → 웹에 게시(CSV) → (선택) `legacy/apps_script.gs` 배포
  2. 운영자: 레지스트리 시트에 `USERCODE, CSV_URL` 행 추가
  3. 끝 — 웹앱·라벨 도구는 그대로, 재배포 불필요
- **비용 구조**: Cloudflare Pages 정적 파일은 무료·무제한, Google Sheets 발행 CSV도 무료. 조회 1회 = 정적 페이지 1 + CSV fetch 2 — 서버 코드가 없어 100명이 아니라 수천 명이어도 0원.
- **한계(수용한 트레이드오프)**: 시트가 공개 발행되므로 민감정보는 넣지 않음(원두 정보라 무해). Apps Script URL을 아는 사람은 행 추가 가능(수정·삭제는 불가, KEY 중복 거절) — 개인·소모임 규모에서 충분하고, 문제가 생기면 해당 사용자만 재배포하면 됨.

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
- **도메인 변경 시**: `legacy/make_label.py`의 `BASE_URL` 한 줄 수정 후 `--all` 재생성 (알파뉴메릭 모드 이탈 시 스크립트가 에러로 알려줌)

## 9. 운영 체크리스트

- [x] 라벨 생성기 + QR 전수 검증 (203/320dpi)
- [x] 조회 웹앱 상태 처리 및 로컬 검증
- [x] GitHub 리포 생성·push (mint-m/Bean-Hoarder)
- [x] Cloudflare Pages `bnhd` 생성·배포 → https://bnhd.pages.dev 라이브 (경로형/쿼리형 URL 200 확인)
- [ ] 구글시트 생성·발행 → `index.html`의 `SHEET_CSV_URL` 입력 → 재배포
- [ ] 라벨 실인쇄 → 폰 카메라 스캔 테스트
- [ ] 로스터리 실제 로고 파일 교체 (`logos/DANCHE.svg`)

## 10. 확장 아이디어

- 라벨 여러 장을 A4 한 페이지에 배치하는 시트 출력 모드
- 웹앱에 "전체 원두 목록" 뷰 (코드 없이 접속 시)
- Apps Script로 시트에서 행 추가 시 KEY 자동 채번
