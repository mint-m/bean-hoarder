// 라벨 렌더러(label.js) 단위 테스트 — vitest
// buildLabelSVG는 DOM 없이 동작하는 순수 SVG 문자열 생성부만 검증한다
// (renderCanvas/verifyQr는 브라우저 전용 — 라이브에서 렌더링 때마다 자동 실행됨).

import assert from "node:assert/strict";
import {
  BASE_URL,
  buildHeadline,
  buildLabelSVG,
  DEFAULT_DESIGN,
  headlineUsedFields,
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

test("헤드라인 조합: 국가+가장 세부 장소, LOT은 보조로 덧붙임, 시그니쳐명은 대체", () => {
  // 장소 앵커 우선순위: 워싱스테이션 > 생산자 > 지역
  assert.equal(buildHeadline({ ORIGIN: "ETHIOPIA", REGION: "Yirgacheffe" }), "ETHIOPIA YIRGACHEFFE");
  assert.equal(
    buildHeadline({ ORIGIN: "ETHIOPIA", REGION: "Sidama", WASHING_STATION: "Gara Agena" }),
    "ETHIOPIA GARA AGENA",
  );
  // LOT은 단독 앵커가 아니라 장소 뒤 보조
  assert.equal(
    buildHeadline({ ORIGIN: "COLOMBIA", PRODUCER: "El Paraiso", LOT: "Lot 12" }),
    "COLOMBIA EL PARAISO · LOT 12",
  );
  // 시그니쳐/블렌드명 오버라이드
  assert.equal(
    buildHeadline({ ORIGIN: "블렌드", COFFEE_NAME: "푸루티 봉봉", REGION: "무시됨" }),
    "푸루티 봉봉".toUpperCase(),
  );
  // 블렌드 원산지는 stripParen으로 축약 (#9 흡수분)
  assert.equal(buildHeadline({ ORIGIN: "블렌드 (여러 원산지 혼합)" }), "블렌드");
  // 헤드라인이 소비한 필드 목록 (부제목 중복 방지)
  assert.deepEqual(headlineUsedFields({ ORIGIN: "ETHIOPIA", WASHING_STATION: "Gara Agena", LOT: "Lot 1" }), [
    "WASHING_STATION",
    "LOT",
  ]);
  assert.deepEqual(headlineUsedFields({ ORIGIN: "ETHIOPIA", COFFEE_NAME: "봉봉", REGION: "X" }), []);
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
