#!/usr/bin/env node
// 데모 원두 시드를 데이터에서 파생시킨다.
//
// 같은 원두 3건이 두 곳에 필요하다 — 정적 데모 덱(/demo)이 읽는 데이터와, 로컬·e2e D1에
// 심는 INSERT다. 손으로 양쪽을 맞추면 반드시 어긋나므로 데이터 쪽(apps/web/src/demo-beans.json)만
// 사람이 고치고, db/seed.sql의 마커 사이 블록은 여기서 생성한다.
//
// CSV 키(UPPER_SNAKE)와 D1 컬럼명(snake_case)은 1:1이라(@bnhd/schema BEAN_FIELDS의 규약)
// 컬럼 목록을 따로 적지 않고 JSON 키를 소문자로 내려 쓴다 — 필드가 늘어도 이 스크립트는 그대로다.
//
// 실행: npm run gen:demo-seed            db/seed.sql 갱신
//       npm run gen:demo-seed -- --check 생성 결과가 커밋된 것과 같은지만 검사

import { readFileSync, writeFileSync } from "node:fs";

const DATA = "apps/web/src/demo-beans.json";
const SEED = "db/seed.sql";
const BEGIN = "-- >>> 데모 원두 (생성됨 — npm run gen:demo-seed, 원본은 apps/web/src/demo-beans.json)";
const END = "-- <<< 데모 원두";

const q = (v) => `'${String(v ?? "").replace(/'/g, "''")}'`;

function build() {
  const beans = JSON.parse(readFileSync(DATA, "utf8"));
  if (!beans.length) throw new Error(`${DATA}가 비어 있다`);
  const cols = Object.keys(beans[0]).map((k) => k.toLowerCase());
  const rows = beans.map(
    (b) =>
      `  (${Object.keys(beans[0])
        .map((k) => q(b[k]))
        .join(", ")}, 'DEMO')`,
  );
  return [
    BEGIN,
    `INSERT OR REPLACE INTO beans (${cols.join(", ")}, usercode) VALUES`,
    `${rows.join(",\n")};`,
    END,
  ].join("\n");
}

const seed = readFileSync(SEED, "utf8");
const start = seed.indexOf(BEGIN);
const stop = seed.indexOf(END);
if (start < 0 || stop < 0) throw new Error(`${SEED}에서 데모 원두 마커를 찾지 못했다`);
const next = seed.slice(0, start) + build() + seed.slice(stop + END.length);

if (process.argv.includes("--check")) {
  if (next !== seed) {
    console.error(`gen:demo-seed — ${SEED}가 ${DATA}와 어긋난다. npm run gen:demo-seed 로 갱신할 것.`);
    process.exit(1);
  }
  console.log(`gen:demo-seed — ${SEED}가 ${DATA}와 일치함`);
} else {
  writeFileSync(SEED, next);
  console.log(`gen:demo-seed — ${SEED} 갱신 (데모 원두 ${JSON.parse(readFileSync(DATA, "utf8")).length}건)`);
}
