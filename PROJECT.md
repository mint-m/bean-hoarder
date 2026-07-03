# CUPCODE — 커피 원두 소분 라벨링 & 조회 시스템

QR 코드 기반 트레이서빌리티를 갖춘 개인/테스트용 원두 소분 라벨 시스템.
40×20mm 라벨을 인쇄하고, QR을 스캔하면 구글시트에 등록된 원두 상세 정보를 조회한다.
**총 운영 비용: 0원** (Cloudflare Pages + Google Sheets 무료 티어).

## 1. 시스템 구성

```
[구글시트]  ──발행(CSV)──▶  [조회 웹앱]  ◀──스캔──  [라벨 QR]
  원두 DB                    index.html              40×20mm
  (KEY 기준)                (Cloudflare Pages)      (QR + 코드 병기)
```

세 요소가 `KEY` 값 하나로 연결된다.

## 2. 키 체계

```
{유저코드 5자리}{연도 2자리}-{원두순번 3자리}
```

- **유저코드 확정: `VEHUH`** (혼동 문자 0/O/1/I 제외 난수로 생성, 고정)
- 첫 키: `VEHUH26-001`. 연도 내 증가, 매년 001 리셋.
- 시트에서 순번 자동화가 필요하면 KEY 열에:
  `="VEHUH26-"&TEXT(ROW()-1,"000")` (행 순서 = 등록 순서 전제. 행 삭제 시 키가 밀리므로, 확정된 키는 값으로 붙여넣기 권장)

## 3. QR 인코딩 (확정 사양 — 원안에서 변경)

QR 내용은 **대문자 경로형 URL**을 사용한다:

```
HTTPS://CUPCODE.PAGES.DEV/VEHUH26-001
```

| 방식 | QR 모드 | 결과 |
|---|---|---|
| `https://…/?c=KEY` (원안) | 바이트 | 버전 3 (29×29), ECC L |
| **`HTTPS://…/KEY` (확정)** | **알파뉴메릭** | **버전 2 (25×25), ECC M** |

- 대문자 URL은 QR 알파뉴메릭 모드에 들어가 한 버전 작아지고, 오류정정도 L→M으로 상향.
- 도메인은 대소문자 무관, 경로(KEY)는 원래 대문자라 문제 없음.
- 웹앱은 경로형(`/KEY`)과 쿼리형(`?c=KEY`) 둘 다 지원.
- Cloudflare Pages는 `404.html`이 없으면 모든 경로에 `index.html`을 반환(SPA 폴백)하므로 경로형 URL에 별도 라우팅 설정 불필요.

## 4. 라벨 사양

- **크기**: 40×20mm 벡터 SVG (mm 단위), 320dpi 감열식 1도 흑백
- **QR**: 우측 8mm(원안 7mm에서 확대, 모듈당 0.32mm로 스캔 안정성 확보), 25×25 모듈, 콰이엇존 1.3mm. 코드 텍스트를 QR 아래 병기.
- **폰트**: 헤드라인 Arial 볼드, 스펙 Consolas 모노스페이스
- **넘침 방지**: 모든 텍스트에 `textLength` 고정 — 프린터 드라이버가 폰트를 치환해도 라벨 밖으로 안 넘침
- **검증**: 생성 파이프라인이 320dpi PNG를 렌더링한 뒤 QR을 실제 디코드해서 전수 확인 (zxing-cpp)

정보 계층 (위→아래): 로스터리(eyebrow) → 원산지(헤드라인) → 품종·가공 → 스펙 그리드(ALT·HARV / RSTD·PKGD / NET·AGT) → 테이스팅 노트(이탤릭) → QR+코드.
애그트론 추정치는 `~` 표기 (예: `AGT ~65`).

## 5. 라벨 생성 도구

```
py tools/make_label.py --key VEHUH26-001    # 한 장
py tools/make_label.py --all                # CSV 전체 배치 생성
```

- 입력: `bean_sheet_template.csv` (또는 `--csv`로 구글시트 내보내기 파일 지정)
- 출력: `labels/{KEY}.svg` (인쇄용) + `labels/{KEY}_320dpi.png` (미리보기) + QR 디코드 검증
- 의존성: `py -m pip install segno zxing-cpp pillow resvg-py` (설치 완료)

## 6. 시트 스키마

`bean_sheet_template.csv` 컬럼 그대로 구글시트에 임포트:

`KEY, ROASTERY, ORIGIN, REGION, VARIETY, PROCESS, ALTITUDE, HARVEST, ROAST_DATE, PACKAGE_DATE, NET_WEIGHT, AGTRON, TASTING_NOTE, SOURCE_URL`

- `KEY`가 기준 열. 빈 필드는 웹앱에서 자동 숨김 — 정보가 확보되는 대로 채우면 됨.
- `REGION`, `SOURCE_URL`은 라벨엔 없고 웹앱에서만 표시.

## 7. 조회 웹앱 (`index.html`)

정적 HTML 한 장, 백엔드 없음. PapaParse(CDN)로 발행된 시트 CSV를 클라이언트에서 파싱.

- `SHEET_CSV_URL`이 비어 있으면 리포의 `bean_sheet_template.csv`를 읽음 → 로컬 테스트와 첫 배포 데모가 설정 없이 동작
- 코드 없음 / 형식 오류 / 미등록 / 로드 실패 상태 처리 완료 (로컬 검증 완료)
- 로컬 미리보기: `py -m http.server 8788` 후 `http://localhost:8788/?c=VEHUH26-001`

## 8. 배포 절차 (남은 수동 단계)

도메인 `cupcode.pages.dev`는 현재 DNS 미등록(NXDOMAIN) 확인 — 선점되지 않았을 가능성이 높으나, 최종 확정은 Cloudflare에서 프로젝트 생성 시점에 이뤄진다.

1. GitHub에 리포 push (`git remote add origin … && git push`)
2. Cloudflare dash → Workers & Pages → Create → Pages → Connect to Git → 리포 선택
   - 프로젝트 이름 **cupcode** 입력 (이름이 거부되면 아래 "도메인 변경 시" 참고)
   - Framework preset `None`, Build command 비움, Output directory `/`
3. 구글시트 생성: `bean_sheet_template.csv` 임포트 → 파일 → 공유 → 웹에 게시 → CSV 발행
4. 발행된 CSV URL을 `index.html`의 `SHEET_CSV_URL`에 입력 → push (자동 재배포)
5. 실기기 스캔 테스트: 인쇄한 라벨 QR을 폰 카메라로 스캔 → 조회 확인

**도메인 변경 시**: `tools/make_label.py`의 `BASE_URL` 한 줄만 수정 후 `--all`로 라벨 재생성.
새 이름도 반드시 **영숫자 대문자 표기 가능**(하이픈 포함 가능 — 하이픈도 알파뉴메릭 셋에 포함)하고, `HTTPS://{이름}.PAGES.DEV/` + KEY 10자가 37~38자 이내면 QR 버전 2가 유지된다. 스크립트가 알파뉴메릭 모드 이탈 시 에러로 알려줌.

## 9. 파일 목록

| 파일 | 용도 |
|---|---|
| `index.html` | 조회 웹앱 (배포 대상) |
| `bean_sheet_template.csv` | 구글시트 임포트용 템플릿 겸 데모 데이터 |
| `tools/make_label.py` | 라벨 SVG/PNG 생성 + QR 검증 |
| `labels/` | 생성된 라벨 (SVG=인쇄용, PNG=미리보기) |
| `PROJECT.md` | 본 문서 |

## 10. 확장 아이디어

- 라벨 여러 장을 A4 한 페이지에 배치하는 시트 출력 모드 (일반 프린터 + 라벨지 대응)
- 웹앱에 "전체 원두 목록" 뷰 (코드 없이 접속 시)
- Apps Script로 시트에서 행 추가 시 KEY 자동 채번
