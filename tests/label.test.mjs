// 라벨 렌더러(label.js) 단위 테스트 — node --test
// buildLabelSVG는 DOM 없이 동작하는 순수 SVG 문자열 생성부만 검증한다
// (renderCanvas/verifyQr는 브라우저 전용 — 라이브에서 렌더링 때마다 자동 실행됨).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// label.js는 브라우저에서 <script>로 선로드되는 전역 qrcode에 의존 — 테스트에선 vendored 사본을 주입
globalThis.qrcode = require("../v2/public/vendor/qrcode.js");

const { buildLabelSVG, SIZE_SPECS, DEFAULT_DESIGN, BASE_URL } = await import("../v2/public/label.js");

const ROW = {
  KEY: "TEST26-001", ROASTERY: "DANCHE", ORIGIN: "ETHIOPIA",
  REGION: "Yirgacheffe, Gedeb", PROCESS: "Washed", VARIETY: "74158",
  ALTITUDE: "2100m", ROAST_DATE: "26.06.28", PACKAGE_DATE: "26.07.03",
  NET_WEIGHT: "60g", AGTRON: "#95 (라이트)", TASTING_NOTE: "Jasmine, bergamot, white peach",
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
    assert.equal(moduleCount, 25);   // 대문자 경로형 URL → 알파뉴메릭 버전2 유지
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

test("50x60(세로형): QR이 가로 중앙·하단에 배치", () => {
  const { svg } = buildLabelSVG(ROW, designFor("50x60"));
  const S = SIZE_SPECS["50x60"];
  const module = S.qrDots * 0.125;
  const qrSize = module * 25;
  const moduleAttr = module.toFixed(4).replace(".", "\\.");
  const xs = [...svg.matchAll(new RegExp(`<rect x="([\\d.]+)" y="([\\d.]+)" width="${moduleAttr}"`, "g"))]
    .map(m => [+m[1], +m[2]]);
  assert.ok(xs.length > 0, "QR 렉트 존재");
  const minX = Math.min(...xs.map(p => p[0]));
  const minY = Math.min(...xs.map(p => p[1]));
  assert.ok(Math.abs(minX - (S.W - qrSize) / 2) < 0.2, `QR 좌측 시작 ${minX} ≈ 중앙 정렬`);
  assert.ok(minY > S.H / 2, `QR은 하단 절반에 (${minY})`);
});

test("빈 옵션 필드는 라벨에서 생략, 긴 텍스트는 말줄임", () => {
  const { svg } = buildLabelSVG({ KEY: "TEST26-002", ROASTERY: "R", ORIGIN: "BRAZIL" }, designFor("40x20"));
  assert.ok(!svg.includes("RSTD"));   // 스펙 값 없음 → 셀 생략
  const long = buildLabelSVG(Object.assign({}, ROW, {
    ORIGIN: "A VERY LONG ORIGIN NAME THAT WILL NEVER FIT ON A TINY LABEL AT ALL",
  }), designFor("40x20"));
  assert.ok(long.svg.includes("…"), "말줄임 처리");
});
