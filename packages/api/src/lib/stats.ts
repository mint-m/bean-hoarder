// 관리자 대시보드의 집계 — 멀리서 전체를 보는 숫자만 만든다(#88).
//
// 계정별 표 같은 세부는 두지 않는다. 운영자가 알아야 하는 것은 "얼마나 크고, 얼마나 움직이고,
// 한도에 얼마나 가까운가"이지 누가 무엇을 올렸는가가 아니다. D1에서 그룹 집계만 받아 오고,
// 순수 함수(여기)가 달 채우기·구간 나누기·로스팅 레벨·향미 노트 세기를 맡아 Node 테스트가 검사한다.
import { canonicalNote, isKnownNote, parseNotes } from "@bnhd/schema/flavor";
import { parseRoastLevel, ROAST_LEVELS } from "@bnhd/schema/roast";

export interface MonthPoint {
  month: string; // 'YYYY-MM'
  signups: number;
  beans: number;
}

/** 'YYYY-MM' 달 목록 — `end`를 포함해 뒤로 `n`개, 오름차순. UTC 기준(D1의 datetime('now')와 같다). */
export function lastMonths(n: number, end = new Date()): string[] {
  const out: string[] = [];
  let y = end.getUTCFullYear();
  let m = end.getUTCMonth(); // 0-based
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m + 1).padStart(2, "0")}`);
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
  }
  return out;
}

/** 월별 가입·등록을 빈 달 0으로 채워 한 축에 놓는다 — 차트가 빈 달을 건너뛰면 추이가 거짓말을 한다. */
export function monthlySeries(
  months: readonly string[],
  signups: readonly { month: string; n: number }[],
  beans: readonly { month: string; n: number }[],
): MonthPoint[] {
  const s = new Map(signups.map((r) => [r.month, r.n]));
  const b = new Map(beans.map((r) => [r.month, r.n]));
  return months.map((month) => ({ month, signups: s.get(month) ?? 0, beans: b.get(month) ?? 0 }));
}

/** 계정당 원두 수 → 구간 분포. 표 대신 "대부분이 몇 개쯤 갖고 있나"를 한 줄로. */
export const BEAN_BUCKETS = ["0", "1–5", "6–20", "21+"] as const;
export function beansPerAccount(counts: readonly number[]): { bucket: string; n: number }[] {
  const n: Record<(typeof BEAN_BUCKETS)[number], number> = { "0": 0, "1–5": 0, "6–20": 0, "21+": 0 };
  for (const c of counts) {
    if (c <= 0) n["0"]++;
    else if (c <= 5) n["1–5"]++;
    else if (c <= 20) n["6–20"]++;
    else n["21+"]++;
  }
  return BEAN_BUCKETS.map((bucket) => ({ bucket, n: n[bucket] }));
}

/** 로스팅 레벨 분포 — 저장값(agtron 문자열)을 6단계로 붙인다. 못 읽는 값은 "미상". */
export function roastDistribution(
  rows: readonly { agtron: string; n: number }[],
): { level: string; n: number }[] {
  const acc = new Map<string, number>(ROAST_LEVELS.map((l) => [l.en, 0]));
  let unknown = 0;
  let empty = 0;
  for (const r of rows) {
    if (!r.agtron.trim()) {
      empty += r.n;
      continue;
    }
    const lv = parseRoastLevel(r.agtron);
    if (lv) acc.set(lv.en, (acc.get(lv.en) ?? 0) + r.n);
    else unknown += r.n;
  }
  const out = [...acc.entries()].map(([level, n]) => ({ level, n }));
  if (unknown) out.push({ level: "미상", n: unknown });
  if (empty) out.push({ level: "미입력", n: empty });
  return out;
}

/** 향미 노트 상위 — 어휘 표기로 정규화해 센다(어휘 밖 자유입력은 "승격 후보"가 따로 다룬다). */
export function topNotes(
  rows: readonly { tasting_note: string }[],
  limit = 12,
): { note: string; n: number }[] {
  const acc = new Map<string, number>();
  for (const r of rows) {
    for (const t of parseNotes(r.tasting_note)) {
      if (!isKnownNote(t)) continue;
      const en = canonicalNote(t);
      acc.set(en, (acc.get(en) ?? 0) + 1);
    }
  }
  return [...acc.entries()]
    .map(([note, n]) => ({ note, n }))
    .sort((a, b) => b.n - a.n || a.note.localeCompare(b.note))
    .slice(0, limit);
}

/** 어휘 밖 노트 집계 — 표기 변형(대소문자·공백)은 하나로 모으고, 처음 본 표기를 대표로 쓴다(#78). */
export function flavorCandidates(
  rows: readonly { usercode: string; tasting_note: string }[],
): { note: string; count: number; users: number }[] {
  const acc = new Map<string, { note: string; count: number; users: Set<string> }>();
  for (const r of rows) {
    for (const token of parseNotes(r.tasting_note)) {
      if (isKnownNote(token)) continue;
      const key = token.toLowerCase().replace(/\s+/g, "");
      const hit = acc.get(key) ?? { note: token, count: 0, users: new Set<string>() };
      hit.count += 1;
      hit.users.add(r.usercode);
      acc.set(key, hit);
    }
  }
  return [...acc.values()]
    .map((v) => ({ note: v.note, count: v.count, users: v.users.size }))
    .sort((a, b) => b.count - a.count || b.users - a.users || a.note.localeCompare(b.note));
}
