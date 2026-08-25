#!/usr/bin/env node
// 라이브 데모 원두를 저장소로 떠 온다 — 데모 데이터가 흐르는 방향의 출발점.
//
// **권위는 원격 D1에 있다.** 데모 덱(/demo)의 카드를 누르면 열리는 상세는 정적 페이지가 아니라
// 실제 공개 조회(/{KEY})이고, 그건 원격 D1이 답한다. 즉 방문자가 보는 내용을 최종적으로 정하는
// 것은 언제나 라이브다. 저장소의 JSON은 정적 덱을 빌드하기 위한 그 사본일 뿐이다.
//
// 그래서 데이터는 한 방향으로만 흐른다:
//
//   원격 D1  ──(이 스크립트)──▶  demo-beans.json  ──(gen-demo-seed)──▶  db/seed.sql  ──▶  로컬·e2e D1
//
// 로컬 D1에서 떠 오지 않는 이유가 여기 있다. 로컬은 이 사슬의 끝(seed로 심어지는 쪽)이라
// 거기서 되떠 오면 seed → 로컬 → JSON → seed로 고리가 닫히고, JSON이 원본도 사본도 아닌
// 어중간한 것이 된다. 로컬에서 아무리 꾸며도 라이브 카드는 그대로이므로 데모도 거짓이 된다.
//
// 데모 내용을 바꾸려면 **랩에서 DEMO 계정으로 로그인해 라이브 원두를 고친 뒤** 이걸 돌린다.
// 등록 화면이 하는 일을 사람이 JSON으로 대신하지 않기 위한 경로다.
//
// 흐름: 랩(라이브)에서 편집 → npm run gen:demo-beans → 커밋 → 배포
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

const where = `usercode = '${USERCODE}' AND archived = 0`;

const raw = execFileSync(
  "npx",
  [
    "wrangler",
    "d1",
    "execute",
    "bnhd-v2",
    "--remote",
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
    `gen:demo-beans — 원격 D1에 ${USERCODE} 계정의 원두가 없다. ` +
      "랩에서 그 계정으로 로그인해 데모로 내놓을 원두를 먼저 등록할 것.",
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
console.log(`gen:demo-beans — ${OUT} 갱신 (원격 D1에서 ${beans.length}건)`);

execFileSync("node", ["scripts/gen-demo-seed.mjs"], { stdio: "inherit" });
