// 라벨 렌더러(label.js) 단위 테스트 — vitest
// buildLabelSVG는 DOM 없이 동작하는 순수 SVG 문자열 생성부만 검증한다
// (renderCanvas/verifyQr는 브라우저 전용 — 라이브에서 렌더링 때마다 자동 실행됨).

import assert from "node:assert/strict";
import {
  BASE_URL,
  buildLabelSVG,
  buildQrSVG,
  DEFAULT_DESIGN,
  QR_DOT_OPTIONS,
  qrSizeMM,
  SIZE_SPECS,
  SPEC_POOL,
  SUB_POOL,
} from "@bnhd/label";
import { test } from "vitest";

const ROW = {
  KEY: "TEST26-001",
  ROASTERY: "DANCHE",
  ORIGIN: "ETHIOPIA",
  REGION: "Yirgacheffe, Gedeb",
  PROCESS: "Washed",
  VARIETY: "74158",
  ALTITUDE: "2100m",
  ROAST_DATE: "26.06.28",
  PACKAGE_DATE: "26.07.03",
  NET_WEIGHT: "60g",
  AGTRON: "#95 (라이트)",
  TASTING_NOTE: "Jasmine, bergamot, white peach",
};

function designFor(size) {
  const d = structuredClone(DEFAULT_DESIGN);
  d.size = size;
  d.headlineSize = SIZE_SPECS[size].headline.def;
  d.specValueSize = SIZE_SPECS[size].specVal.def;
  return d;
}

for (const size of Object.keys(SIZE_SPECS)) {
  const S = SIZE_SPECS[size];

  test(`${size}: SVG 치수·QR 콘텐츠·모듈 수`, () => {
    const { svg, content, moduleCount, W, H } = buildLabelSVG(ROW, designFor(size));
    assert.equal(W, S.W);
    assert.equal(H, S.H);
    assert.ok(svg.includes(`width="${S.W}mm" height="${S.H}mm"`));
    assert.ok(svg.includes(`viewBox="0 0 ${S.W} ${S.H}"`));
    assert.equal(content, `${BASE_URL}/TEST26-001`);
    assert.equal(moduleCount, 25); // 대문자 경로형 URL → 알파뉴메릭 버전2 유지
    assert.ok(svg.includes("TEST26-001"));
    assert.ok(svg.includes("ETHIOPIA"));
  });

  test(`${size}: QR 모듈이 도트 격자 크기(${S.qrDots}도트)로 렌더`, () => {
    const { svg } = buildLabelSVG(ROW, designFor(size));
    const module = (S.qrDots * 0.125).toFixed(4);
    const qrRects = svg.match(new RegExp(`width="${module}" height="${module}"`, "g")) || [];
    assert.ok(qrRects.length > 100, `QR 다크 모듈 수 ${qrRects.length}`);
  });

  test(`${size}: 요소가 라벨 영역을 벗어나지 않음`, () => {
    const { svg } = buildLabelSVG(ROW, designFor(size));
    for (const m of svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"/g)) {
      assert.ok(+m[1] >= 0 && +m[1] <= S.W, `text x=${m[1]}`);
      assert.ok(+m[2] >= 0 && +m[2] <= S.H, `text y=${m[2]}`);
    }
    for (const m of svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
      assert.ok(+m[1] + +m[3] <= S.W + 0.01, `rect 우측 초과 ${m[0]}`);
      assert.ok(+m[2] + +m[4] <= S.H + 0.01, `rect 하단 초과 ${m[0]}`);
    }
  });
}

test("50x60(세로형): QR이 우측·하단에 배치, 로스팅일·패키징일은 좌측에 배치", () => {
  const { svg } = buildLabelSVG(ROW, designFor("50x60"));
  const S = SIZE_SPECS["50x60"];
  const module = S.qrDots * 0.125;
  const qrSize = module * 25;
  const moduleAttr = module.toFixed(4).replace(".", "\\.");
  const xs = [
    ...svg.matchAll(new RegExp(`<rect x="([\\d.]+)" y="([\\d.]+)" width="${moduleAttr}"`, "g")),
  ].map((m) => [+m[1], +m[2]]);
  assert.ok(xs.length > 0, "QR 렉트 존재");
  const minX = Math.min(...xs.map((p) => p[0]));
  const minY = Math.min(...xs.map((p) => p[1]));
  assert.ok(Math.abs(minX - (S.W - S.margin - qrSize)) < 0.2, `QR 좌측 시작 ${minX} ≈ 우측 정렬`);
  assert.ok(minY > S.H / 2, `QR은 하단 절반에 (${minY})`);
  const rstdX = +/<text x="([\d.]+)"[^>]*>RSTD</.exec(svg)[1];
  assert.ok(rstdX < minX, "RSTD 라벨은 QR보다 왼쪽에 위치");
});

test("빈 옵션 필드는 라벨에서 생략, 긴 텍스트는 말줄임", () => {
  const { svg } = buildLabelSVG({ KEY: "TEST26-002", ROASTERY: "R", ORIGIN: "BRAZIL" }, designFor("40x20"));
  assert.ok(!svg.includes("NET")); // 스펙 값 없음 → 셀 생략 (옵션 스펙만 해당)
  assert.ok(
    svg.includes("RSTD") && svg.includes("PKGD"),
    "로스팅일·패키징일은 필수 정보라 값이 비어도 고정 푸터 라벨은 항상 인쇄된다",
  );
  const long = buildLabelSVG(
    Object.assign({}, ROW, {
      ORIGIN: "A VERY LONG ORIGIN NAME THAT WILL NEVER FIT ON A TINY LABEL AT ALL",
    }),
    designFor("40x20"),
  );
  assert.ok(long.svg.includes("…"), "말줄임 처리");
});

test("스펙 값이 칸 절반 폭을 넘으면 말줄임 대신 전체 폭 단독 줄로 랩", () => {
  const d = designFor("50x30");
  d.subFields = [];
  d.specFields = ["PROCESS"];
  const { svg } = buildLabelSVG(
    // REGION 비움: 이 테스트는 스펙 랩 동작만 검증 — 긴 헤드라인이 말줄임되는 건 별개 관심사
    Object.assign({}, ROW, { REGION: "", PROCESS: "Extended Anaerobic Natural Fermentation Process" }),
    d,
  );
  assert.ok(
    svg.includes("Extended") && svg.includes("Process"),
    "가공방식이 잘리지 않고 줄바꿈되어 전부 인쇄됨",
  );
  assert.ok(!svg.includes("…"), "말줄임 없음");
});

test("스펙 항목이 너무 많아 세로 공간을 넘치면 우선순위 낮은(나중 선택) 항목부터 자동으로 줄인다", () => {
  const d = designFor("50x30");
  d.specFields = ["NET_WEIGHT", "AGTRON", "PROCESS", "VARIETY", "ALTITUDE", "HARVEST"];
  const row = Object.assign({}, ROW, {
    REGION: "", // 헤드라인 말줄임과 분리 — 이 테스트는 스펙 드롭 우선순위만 검증
    PROCESS: "Extended Anaerobic Natural Fermentation",
    VARIETY: "Long Variety Name Blend Mix",
    ALTITUDE: "1900-2250m",
    HARVEST: "25/26",
  });
  const { svg } = buildLabelSVG(row, d);
  assert.ok(!svg.includes("…"), "표시되는 항목은 말줄임 없이 전문 인쇄");
  assert.ok(svg.includes(">NET<"), "우선순위 1위(용량)는 유지됨");
  for (const m of svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"/g)) {
    assert.ok(+m[2] <= SIZE_SPECS["50x30"].H, `text y=${m[2]}는 라벨 높이를 넘지 않음`);
  }
});

// 헤드라인 조합 규칙 단위 테스트는 @bnhd/schema/headline로 이동(단일 소스).
// 여기서는 라벨이 그 결과를 **저장된 대소문자 그대로** 찍는지를 지킨다.
//
// 예전에는 라벨이 .toUpperCase()로 대문자를 강제했다. 그런데 대문자는 같은 이름을 7% 넓게 만들어
// 잘림을 앞당기고(383px vs 355px), Yirgacheffe·La Cabaña 같은 고유명사의 결을 뭉갠다. 화면(덱·조회)의
// 대문자 강제를 걷어내면서 라벨도 함께 풀어 인쇄물과 화면의 표기를 하나로 뒀다.
// 대가: 사용자가 "colombia"라고 적으면 라벨에도 그대로 나간다 — 정규화 그물이 하나 사라진 셈이다.
// 로스터리·KEY는 마이크로 캡스라 여전히 대문자로 찍는다(그 자리는 아래 다른 테스트가 지킨다).
test("헤드라인은 저장된 대소문자 그대로 라벨에 렌더된다 (대문자 강제 없음)", () => {
  const d = designFor("40x20");
  const { svg } = buildLabelSVG(Object.assign({}, ROW, { COFFEE_NAME: "푸루티 봉봉" }), d);
  assert.ok(svg.includes("푸루티 봉봉"), "COFFEE_NAME 오버라이드가 헤드라인으로 렌더");
  const { svg: svg2 } = buildLabelSVG(
    { ...ROW, COFFEE_NAME: "", ORIGIN: "COLOMBIA", REGION: "Pitalito, Huila" },
    d,
  );
  // 40x20에서는 라벨 폭에 맞춰 "COLOMBIA Pitalit…"로 잘린다 — 대소문자만 본다.
  // (대문자를 걷어낸 덕에 같은 폭에 7% 더 들어가므로 잘림 자체도 조금 늦춰진다)
  assert.ok(svg2.includes("COLOMBIA Pitalit"), "지역의 원래 대소문자가 유지된다");
  assert.ok(!svg2.includes("PITALIT"), "대문자로 바꾸지 않는다");
});

test("노트 렌더링 보장: 스펙이 많아도 테이스팅 노트는 드롭되지 않는다", () => {
  const d = designFor("40x20");
  d.subFields = [];
  d.specFields = ["NET_WEIGHT", "AGTRON", "PROCESS", "VARIETY", "ALTITUDE", "HARVEST"];
  const row = Object.assign({}, ROW, {
    ALTITUDE: "1900-2250m",
    HARVEST: "25/26",
    TASTING_NOTE: "Jasmine, Bergamot, White Peach",
  });
  const { svg } = buildLabelSVG(row, d);
  assert.ok(svg.includes("Jasmine"), "노트 첫 항목이 라벨에 존재(생략되지 않음)");
});

test("40x20(가로형): 헤드라인이 장소·랏을 흡수하고 잔여 부제목만 표시, 날짜는 최하단 한 줄(2열)", () => {
  const d = designFor("40x20");
  d.subFields = ["REGION", "LOT", "WASHING_STATION"];
  d.specFields = ["NET_WEIGHT", "AGTRON"];
  const row = Object.assign({}, ROW, {
    REGION: "Nariño, Buesaco",
    LOT: "Sewda",
    WASHING_STATION: "Gedeb",
  });
  const { svg } = buildLabelSVG(row, d);
  // 헤드라인은 국가로 시작(길면 말줄임될 수 있으나 국가 접두는 유지). 정확한 조합은 buildHeadline 단위 테스트가 검증.
  assert.ok(svg.includes("ETHIOPIA"), "헤드라인에 국가 포함");
  // 헤드라인이 쓴 WASHING_STATION·LOT은 부제목에서 제외, 잔여 REGION은 부제목에 남음
  assert.ok(svg.includes("Nariño"), "잔여 부제목(REGION) 표시");
  const S = SIZE_SPECS["40x20"];
  const rstd = /<text x="([\d.]+)" y="([\d.]+)"[^>]*>RSTD</.exec(svg);
  const pkgd = /<text x="([\d.]+)" y="([\d.]+)"[^>]*>PKGD</.exec(svg);
  assert.ok(rstd && pkgd, "RSTD·PKGD 인쇄");
  assert.ok(Math.abs(+rstd[2] - +pkgd[2]) < 0.01, "같은 줄(y 동일)에 나란히 배치");
  assert.ok(+pkgd[1] > +rstd[1], "PKGD가 RSTD 오른쪽 열에 위치");
  assert.ok(+rstd[2] > S.H * 0.85, "라벨 최하단에 배치");
});

test("colorMode: mono이면 레드 대신 블랙으로 인쇄, color면 레드 채널 사용", () => {
  const mono = designFor("40x20");
  mono.colorMode = "mono";
  const { svg: monoSvg } = buildLabelSVG(ROW, mono);
  assert.ok(!monoSvg.includes('"#e8341c"'), "레드 채널 미사용");
  const color = designFor("40x20");
  color.colorMode = "color";
  const { svg: colorSvg } = buildLabelSVG(ROW, color);
  assert.ok(colorSvg.includes('"#e8341c"'), "color 모드는 레드 채널 사용");
});

test("DEFAULT_DESIGN 기본값은 흑백(mono) — 2도 인쇄를 지원하지 않는 프린터가 많음", () => {
  assert.equal(DEFAULT_DESIGN.colorMode, "mono");
});

test("50x60(세로형): 로스팅일·패키징일이 QR 옆(좌측)에 한 줄로 촘촘하게 배치되고 QR·라벨 영역을 벗어나지 않음", () => {
  const { svg } = buildLabelSVG(ROW, designFor("50x60"));
  const S = SIZE_SPECS["50x60"];
  const rstd = /<text x="([\d.]+)" y="([\d.]+)"[^>]*>RSTD</.exec(svg);
  const pkgd = /<text x="([\d.]+)" y="([\d.]+)"[^>]*>PKGD</.exec(svg);
  assert.ok(rstd && pkgd, "RSTD·PKGD 라벨 인쇄");
  assert.ok(Math.abs(+rstd[2] - +pkgd[2]) < 0.01, "RSTD·PKGD가 같은 줄(y 동일)에 배치");
  assert.ok(+pkgd[1] > +rstd[1], "PKGD가 RSTD 오른쪽에 이어서 배치");
  const qrMinX = Math.min(
    ...[...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="0\.3750"/g)].map((m) => +m[1]),
  );
  const pkgdVal = /<text x="([\d.]+)" y="[\d.]+"[^>]*>26\.07\.03</.exec(svg);
  assert.ok(pkgdVal && +pkgdVal[1] < qrMinX, "날짜 한 줄이 QR과 겹치지 않고 왼쪽에 위치");
  for (const m of svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"/g)) {
    assert.ok(+m[1] >= 0 && +m[1] <= S.W, `text x=${m[1]}`);
    assert.ok(+m[2] >= 0 && +m[2] <= S.H, `text y=${m[2]}`);
  }
});

test("풀 구성: 가공·품종은 스펙 칸, 지역·랏·워싱스테이션·생산자는 부제목 줄", () => {
  const specKeys = SPEC_POOL.map(([k]) => k);
  const subKeys = SUB_POOL.map(([k]) => k);
  assert.ok(specKeys.includes("PROCESS") && specKeys.includes("VARIETY"), "가공·품종이 스펙 풀에 있음");
  assert.ok(!subKeys.includes("PROCESS") && !subKeys.includes("VARIETY"), "가공·품종이 부제목 풀엔 없음");
  for (const k of ["REGION", "LOT", "WASHING_STATION", "PRODUCER"]) {
    assert.ok(subKeys.includes(k), `${k}가 부제목 풀에 있음`);
  }
  for (const k of ["LOT", "WASHING_STATION", "PRODUCER"]) {
    assert.ok(!specKeys.includes(k), `${k}가 스펙 풀엔 없음`);
  }
});

test("노트: 콤마 항목이 한 줄에 다 안 들어가면 말줄임(…) 대신 다 들어가는 항목까지만 표시", () => {
  const d = designFor("40x20");
  d.subFields = [];
  d.specFields = ["NET_WEIGHT", "ALTITUDE"];
  const row = Object.assign({}, ROW, {
    REGION: "", // 헤드라인 말줄임과 분리 — 이 테스트는 노트 항목 단위 축약만 검증
    ALTITUDE: "1850-1910m",
    TASTING_NOTE: "Grape, Cherry Cordial, Tropical Citrus, Long Extra Flavor Note That Never Fits",
  });
  const { svg } = buildLabelSVG(row, d);
  assert.ok(svg.includes("Grape, Cherry Cordial"), "다 들어가는 앞쪽 항목은 온전히 표시");
  assert.ok(!svg.includes("Tropical Cit"), "안 들어가는 항목은 단어 중간이 아니라 항목 단위로 생략");
  assert.ok(!svg.includes("…"), "말줄임 문자 사용 안 함");
});

test("노트: 스펙 그리드가 짧게 끝나도 노트는 본문 최하단(고정 푸터 바로 위)에 위치", () => {
  const d = designFor("50x30");
  d.subFields = [];
  d.specFields = ["NET_WEIGHT"]; // 스펙 한 줄만 → 그 아래 여백이 넉넉히 남음
  const { svg } = buildLabelSVG(ROW, d);
  const S = SIZE_SPECS["50x30"];
  const note = /<text x="[\d.]+" y="([\d.]+)"[^>]*font-style="italic"[^>]*>/.exec(svg);
  assert.ok(note, "노트가 인쇄됨");
  assert.ok(+note[1] > S.H * 0.7, `노트가 하단(날짜 바로 위)에 위치 (y=${note[1]})`);
});

test("노트 우선: 스펙이 공간을 다 채워도 노트(2순위)는 보장되고 스펙(3순위)이 먼저 드롭된다", () => {
  const d = designFor("40x20");
  d.subFields = [];
  d.specFields = ["NET_WEIGHT", "AGTRON", "PROCESS", "VARIETY", "ALTITUDE", "HARVEST"];
  const row = Object.assign({}, ROW, {
    REGION: "",
    PROCESS: "Extended Anaerobic Natural Fermentation Process Description",
    ALTITUDE: "1900-2250m",
    HARVEST: "25/26",
    TASTING_NOTE: "Jasmine, Bergamot",
  });
  const { svg } = buildLabelSVG(row, d);
  assert.ok(/font-style="italic"/.test(svg), "공간이 빡빡해도 노트는 항상 표시된다");
  assert.ok(svg.includes("Jasmine"), "노트 내용이 라벨에 존재");
});

// ── QR 단독(buildQrSVG) ──────────────────────────────────────
// 인쇄 정합이 이 함수의 존재 이유다: 모듈 경계가 203dpi 도트 격자(0.125mm)에 정확히 떨어져야
// 감열 출력에서 모듈이 뭉개지지 않는다. 실제 디코드(verifyQr)는 캔버스가 필요해 브라우저에서 돈다.
const DOT = 0.125;

test("QR 단독: 내용은 라벨과 같은 규칙(BASE_URL/KEY, 대문자)", () => {
  const { content } = buildQrSVG("test26-001");
  assert.equal(content, `${BASE_URL}/TEST26-001`, "소문자로 넣어도 대문자 경로형 URL");
  const fromLabel = buildLabelSVG(ROW, designFor("40x20")).content;
  assert.equal(buildQrSVG(ROW.KEY).content, fromLabel, "라벨이 굽는 QR과 같은 내용");
});

test("QR 단독: 모든 모듈이 도트 격자(0.125mm)에 정렬된다", () => {
  for (const dots of QR_DOT_OPTIONS) {
    const { svg } = buildQrSVG("TEST26-001", dots);
    const coords = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)"/g)];
    assert.ok(coords.length > 0, `dots=${dots}: 모듈이 그려짐`);
    for (const [, x, y, w] of coords) {
      for (const v of [x, y, w]) {
        const ratio = Number(v) / DOT;
        assert.ok(
          Math.abs(ratio - Math.round(ratio)) < 1e-6,
          `dots=${dots}: ${v}mm 가 도트 격자의 정수배가 아님`,
        );
      }
    }
  }
});

test("QR 단독: 콰이엇존 2모듈이 이미지에 포함된다 (나머지는 라벨의 흰 바탕이 맡는다)", () => {
  for (const dots of QR_DOT_OPTIONS) {
    const { svg, codeSize, size, moduleCount } = buildQrSVG("TEST26-001", dots);
    const module = dots * DOT;
    assert.equal(codeSize, module * moduleCount, `dots=${dots}: QR 한 변 = 모듈 × 개수`);
    assert.equal(size, codeSize + 2 * (2 * module), `dots=${dots}: 전체 = QR + 콰이엇존 양쪽 2모듈`);
    assert.ok(svg.includes(`viewBox="0 0 ${size} ${size}"`), `dots=${dots}: viewBox가 전체 크기`);
    // 첫 모듈(항상 좌상단 파인더 패턴)이 콰이엇존만큼 안쪽에서 시작해야 한다
    const first = /<rect x="([\d.]+)" y="([\d.]+)"/.exec(svg);
    assert.equal(Number(first[1]), 2 * module, `dots=${dots}: 좌측 콰이엇존 확보`);
    assert.equal(Number(first[2]), 2 * module, `dots=${dots}: 상단 콰이엇존 확보`);
  }
});

// 랩의 QR 발급 화면은 "여기 적힌 mm가 곧 인쇄되는 mm"를 약속한다. 그 숫자를 직접 계산하던
// 시절에는 콰이엇존이 빠져 화면 10.9mm / 파일 12.4mm로 갈렸다 — 라벨 소프트웨어에 원본 크기로
// 얹는 사용자에게는 1.5mm가 그대로 어긋남이다. 두 값이 다시 갈라지면 여기서 걸린다.
test("QR 단독: qrSizeMM이 실제 SVG 치수와 같다 (화면 표시와 파일이 갈라지지 않게)", () => {
  for (const dots of QR_DOT_OPTIONS) {
    const { size, moduleCount, svg } = buildQrSVG("TEST26-001", dots);
    assert.equal(qrSizeMM(dots, moduleCount), size, `dots=${dots}: 표시 크기 = 파일 크기`);
    assert.ok(svg.includes(`width="${size}mm"`), `dots=${dots}: SVG width 속성과도 일치`);
  }
});

test("QR 단독: 도트 옵션이 커질수록 인쇄 크기가 커진다 (선택지가 실제로 다른 크기)", () => {
  const sizes = QR_DOT_OPTIONS.map((d) => buildQrSVG("TEST26-001", d).codeSize);
  for (let i = 1; i < sizes.length; i++) {
    assert.ok(sizes[i] > sizes[i - 1], `${sizes[i]} > ${sizes[i - 1]}`);
  }
  assert.ok(sizes[0] > 8 && sizes[0] < 11, `기본 3도트는 스캔 안정 크기대(약 9.4mm) — 실제 ${sizes[0]}`);
});
