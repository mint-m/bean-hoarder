# BEAN-HOARDER v1 — 구버전 기록 (아카이브)

> **이 문서는 v1(구글시트 기반) 회고 기록입니다.** 현재 라이브 서비스는 v2(Cloudflare
> D1 + Functions) — [README.md](README.md)와 [v2/DESIGN.md](v2/DESIGN.md)를 참고하세요.
> v1 웹 파일·도구(`admin.html`, `index.html`, `make_label.py`, `apps_script.gs`,
> `deploy.ps1`, `registry_template.csv`)는 저장소 트리에서 제거됐고, 필요하면 git 히스토리의
> 태그 **`legacy-v1`** 에서 복원할 수 있다(`git show legacy-v1:legacy/make_label.py`).
> ⚠️ v1 라벨 도구 `make_label.py`는 **v1 디자인 산출물**이라 v2의 보딩패스 라벨과 다르다 —
> v2 라벨의 단일 소스는 `packages/label`이다.

v1은 QR 기반 트레이서빌리티를 갖춘 개인/테스트용 원두 소분 라벨 시스템이었다. 40×20mm 라벨을
감열 프린터로 인쇄하고, QR을 스캔하면 **구글시트**에 등록된 원두 정보를 조회했다. 백엔드 없이
정적 웹앱 + 구글시트 발행 CSV로 동작해 운영비 0원이었고, v2가 이 구조를 D1 + Functions로 대체했다.

## v2로 이어진 확정 사양 (변경 불가)

이 둘은 v1에서 정해져 v2에서도 그대로 유지된다 — 인쇄된 실라벨과 묶여 있어 절대 변경 금지:

- **KEY 체계**: `{유저코드4}{연도2}-{원두순번3}` (예: `BXNQ26-001`). 연도 내 증가, 매년 001
  리셋, 고정 9자리라 URL 경로에 그대로 사용.
- **QR 인코딩**: 대문자 경로형 URL(`HTTPS://BNHD.PAGES.DEV/BXNQ26-001`)로 알파뉴메릭 모드를
  강제해 **버전 2(25×25), ECC M** 유지(`?c=` 바이트 모드는 29×29 필요). 도메인
  `bnhd.pages.dev`도 이때 확정.

## v1 구조 (요약)

- **DB**: 구글시트(웹에 게시 → CSV). KEY 기준 열, 빈 필드는 웹앱에서 자동 숨김.
- **조회**: 정적 `index.html` + PapaParse(CDN)로 CSV를 클라이언트에서 파싱. 멀티유저는 레지스트리
  시트(USERCODE→CSV_URL 매핑)로 KEY 앞 4자리를 조회 — 사용자가 늘어도 재배포 불필요, 조회당
  CSV fetch 2회로 백엔드 0원.
- **입력·라벨**: `admin.html`(브라우저 한 화면에서 입력·QR 미리보기·디자인 편집) + 파이썬 배치
  라벨 생성기 `make_label.py`(SVG + 203/320dpi PNG, zxing 실디코드 검증).
- **유저코드**: 혼동 문자(0/O/1/I)를 뺀 31자셋에서 `crypto.getRandomValues`로 4자리 생성,
  레지스트리 시트로 관리(STATUS=disabled로 조회 차단).

## v1 → v2 전환에서 버린 것 / 남긴 것

- **버림**: 구글시트 DB·Apps Script 업로드·정적 CSV 조회·파이썬 라벨 생성기·레지스트리 시트
  운영 — 전부 D1 + Hono API + `packages/label` 렌더러 + 세션 인증으로 대체.
- **남김**: 위 확정 사양(KEY 체계·QR 인코딩·`bnhd.pages.dev` 도메인)과 40×20mm 기본 라벨,
  "운영비 0원" 원칙.

전환 근거와 "v1의 마찰 → v2의 해법" 대응표는 [v2/DESIGN.md](v2/DESIGN.md)에 정리돼 있다.
