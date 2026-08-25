#!/usr/bin/env node
// 데모 덱에 실을 원두를 로컬 D1에서 떠 온다 — 저작 편의를 위한 한 방향 내보내기.
//
// 데모(/demo 덱과 데모 카드)는 apps/web/src/demo-beans.json 하나로 만드는 정적 페이지다.
// D1은 데모를 전혀 모르고, 데모도 D1을 모른다. 그러니 이 JSON은 코드와 같이 커밋되는
// **콘텐츠**이고, 바뀌는 시점은 배포다.
//
// 그렇다고 원두를 JSON에 손으로 적는 건 등록 화면이 하는 일을 사람이 대신하는 꼴이다.
// 그래서 로컬 랩에서 평소처럼 등록·수정해 본 결과를 여기로 받아 적는다:
//
//   로컬 랩에서 편집 → npm run gen:demo-beans → demo-beans.json → 커밋 → 배포
//
// 흐름이 한 줄인 것이 중요하다. 예전에는 db/seed.sql이 이 JSON에서 생성되고 그 seed가 다시
// 로컬 D1을 채워 고리가 닫혔고, 그 안에서 JSON은 원본도 사본도 아니었다. 지금은 seed가
// 데모를 모르므로(픽스처만 담는다) 이 화살표는 되돌아오지 않는다.
//
// 어느 계정에서 뜰지는 --usercode로 고른다. 기본 DEMO는 이 목적의 예약 접두다 — 유저코드
// 알파벳에 O가 없어 실계정에 발급될 수 없고, 조회 페이지가 그 접두를 정적 분기로 쓴다.
//
// 숨긴(archived) 원두는 빼고 가져온다 — 내놓지 않기로 한 것이 구경거리에 남으면 안 된다.
// 컬럼 목록은 적지 않는다. SELECT *가 주는 순서가 곧 db/schema.sql의 순서이고, 그건
// @bnhd/schema BEAN_FIELDS에서 파생된 것이라 필드가 늘어도 이 스크립트는 그대로다.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const OUT = "apps/web/src/demo-beans.json";
/** JSON에 담지 않는 컬럼 — 소유자는 데모에 의미가 없고, 나머지 둘은 카드 표현과 무관하다 */
const DROP = new Set(["usercode", "archived", "created_at"]);

const flag = process.argv.find((a) => a.startsWith("--usercode="));
const usercode = (flag ? flag.split("=")[1] : "DEMO").toUpperCase();

const raw = execFileSync(
  "npx",
  [
    "wrangler",
    "d1",
    "execute",
    "bnhd-v2",
    "--local",
    "--command",
    `SELECT * FROM beans WHERE usercode = '${usercode}' AND archived = 0 ORDER BY key;`,
    "--json",
  ],
  { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
);

// wrangler는 JSON 앞뒤로 진행 로그를 섞어 내보낸다 — 배열 부분만 잘라 쓴다
const rows = JSON.parse(raw.slice(raw.indexOf("[")))[0]?.results ?? [];
if (!rows.length) {
  console.error(
    `gen:demo-beans — 로컬 D1에 ${usercode} 계정의 원두가 없다. ` +
      "랩(http://localhost:8788/lab)에서 그 계정으로 로그인해 데모로 내놓을 원두를 먼저 등록할 것.",
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
console.log(`gen:demo-beans — ${OUT} 갱신 (${usercode} 계정에서 ${beans.length}건)`);
