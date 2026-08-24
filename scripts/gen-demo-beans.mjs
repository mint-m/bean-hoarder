#!/usr/bin/env node
// 데모 원두 데이터를 D1에서 떠 온다 — 손으로 JSON을 고치지 않고 앱에서 꾸미기 위한 경로.
//
// 데모 덱(/demo)은 정적이라 데이터가 저장소에 고정돼 있어야 하는데, 그렇다고 원두를 JSON에
// 손으로 적는 건 등록 화면이 하는 일을 사람이 대신하는 꼴이다. 그래서 평소처럼 랩에서
// DEMO 계정의 원두를 등록·수정한 뒤, 이 스크립트로 그 결과를 JSON에 받아 적는다.
//
// 흐름: 랩에서 편집 → npm run gen:demo-beans [-- --remote] → 커밋 → 배포
//   --local (기본)  로컬 D1(.wrangler)에서 뜬다 — 로컬 개발 서버로 꾸미고 확인하는 경우
//   --remote        원격 D1에서 뜬다 — 라이브 데모 카드를 그대로 저장소에 반영하는 경우
//
// 숨긴(archived) 원두는 빼고 가져온다 — 구경거리에 내놓지 않기로 한 것이 데모 덱에 남으면 안 된다.
// 컬럼 목록은 적지 않는다. SELECT *가 주는 순서가 곧 db/schema.sql의 순서이고, 그건
// @bnhd/schema BEAN_FIELDS에서 파생된 것이라 필드가 늘어도 이 스크립트는 그대로다.
//
// 뜬 뒤에는 db/seed.sql의 데모 블록도 함께 갱신한다(gen-demo-seed.mjs) — 둘이 어긋난 채로
// 커밋되면 npm run check가 실패한다.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const OUT = "apps/web/src/demo-beans.json";
const USERCODE = "DEMO";
/** JSON에 담지 않는 컬럼 — 소유자는 자명하고, 나머지 둘은 카드 표현과 무관한 운영 값이다 */
const DROP = new Set(["usercode", "archived", "created_at"]);

const remote = process.argv.includes("--remote");
const where = `usercode = '${USERCODE}' AND archived = 0`;

const raw = execFileSync(
  "npx",
  [
    "wrangler",
    "d1",
    "execute",
    "bnhd-v2",
    remote ? "--remote" : "--local",
    "--command",
    `SELECT * FROM beans WHERE ${where} ORDER BY key;`,
    "--json",
  ],
  { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
);

// wrangler는 JSON 앞뒤로 진행 로그를 섞어 내보낸다 — 배열 부분만 잘라 쓴다
const start = raw.indexOf("[");
const parsed = JSON.parse(raw.slice(start));
const rows = parsed[0]?.results ?? [];
if (!rows.length) {
  console.error(
    `gen:demo-beans — ${remote ? "원격" : "로컬"} D1에 ${USERCODE} 계정의 원두가 없다. ` +
      `로컬이라면 npx wrangler d1 execute bnhd-v2 --local --file=db/seed.sql 로 먼저 심을 것.`,
  );
  process.exit(1);
}

const beans = rows.map((row) =>
  Object.fromEntries(
    Object.entries(row)
      .filter(([k]) => !DROP.has(k))
      .map(([k, v]) => [k.toUpperCase(), String(v ?? "")]),
  ),
);

writeFileSync(OUT, `${JSON.stringify(beans, null, 2)}\n`);
console.log(`gen:demo-beans — ${OUT} 갱신 (${remote ? "원격" : "로컬"} D1에서 ${beans.length}건)`);

execFileSync("node", ["scripts/gen-demo-seed.mjs"], { stdio: "inherit" });
