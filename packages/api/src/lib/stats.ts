// 관리자 향미 승격 후보의 집계(#78, #88) — 대시보드에서 "결정에 쓰이는" 집계는 이것 하나만 남는다.
//
// 승격은 사람이 PR로 한다. 그 판단에 필요한 것은 (1) 여러 사람이 쓰는가(사용자 수), (2) 오타가 아닌가(비슷한
// 어휘)이므로 둘 다 후보에 실어 보낸다. D1에서 노트 문자열만 받아 오고, 토큰화·집계는 순수 함수(여기)가 맡아
// Node 테스트가 검사한다.
import { FLAVOR_NOTES, isKnownNote, norm, parseNotes } from "@bnhd/schema/flavor";

export interface FlavorCandidate {
  note: string;
  count: number; // 쓰인 횟수
  users: number; // 서로 다른 사용자 수 — 승격 판단의 1순위 신호
  similar: string | null; // 어휘에 아주 비슷한 말이 있으면 그 표기 — 승격이 아니라 입력 교정 후보
}

/** 편집 거리(삽입·삭제·치환 각 1) — 어휘 크기가 백여 개라 O(nm)으로 충분하다. */
function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j] ?? 0;
      prev[j] = Math.min(up + 1, (prev[j - 1] ?? 0) + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length] ?? 0;
}

/** 허용 거리 — 짧은 말은 한 글자만 달라도 다른 말이라, 길이에 따라 0·1·2로 둔다. */
const maxEdits = (len: number): number => (len < 3 ? 0 : len < 8 ? 1 : 2);

/** 어휘에서 가장 가까운 표기(영문) — 허용 거리 안에 없으면 null. 어휘 밖 말이므로 거리 0은 나오지 않는다. */
export function nearestKnown(token: string): string | null {
  const t = norm(token);
  const limit = maxEdits(t.length);
  if (!limit) return null;
  let best: { en: string; d: number } | null = null;
  for (const n of FLAVOR_NOTES) {
    for (const form of [n.en, n.ko]) {
      const d = editDistance(t, norm(form));
      if (d <= limit && (!best || d < best.d)) best = { en: n.en, d };
    }
  }
  return best?.en ?? null;
}

/**
 * 어휘 밖 노트 집계 — 표기 변형(대소문자·공백)은 하나로 모으고 처음 본 표기를 대표로 쓴다(#78).
 * 순서는 **사용자 수** 먼저 — "여러 사람이 반복해서 쓰는 말"이 승격 기준이라, 한 사람이 열 번 쓴 말이
 * 세 사람이 한 번씩 쓴 말보다 앞서면 안 된다.
 */
export function flavorCandidates(
  rows: readonly { usercode: string; tasting_note: string }[],
): FlavorCandidate[] {
  const acc = new Map<string, { note: string; count: number; users: Set<string> }>();
  for (const r of rows) {
    for (const token of parseNotes(r.tasting_note)) {
      if (isKnownNote(token)) continue;
      const key = norm(token);
      const hit = acc.get(key) ?? { note: token, count: 0, users: new Set<string>() };
      hit.count += 1;
      hit.users.add(r.usercode);
      acc.set(key, hit);
    }
  }
  return [...acc.values()]
    .map((v) => ({ note: v.note, count: v.count, users: v.users.size, similar: nearestKnown(v.note) }))
    .sort((a, b) => b.users - a.users || b.count - a.count || a.note.localeCompare(b.note));
}
