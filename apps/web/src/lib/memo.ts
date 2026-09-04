// 메모(기타 정보) 정돈 — 정돈되지 않은 덩어리를 읽을 만한 문단으로 나눈다.
//
// 이 필드에 들어오는 것은 사람이 쓴 글이 아니라 대개 **어딘가에서 옮겨 온 덩어리**다. 상품 페이지를
// 긁어 오면 문장마다 빈 줄이 끼거나 들여쓰기가 딸려 오고, AI가 요약해 넣으면 줄바꿈이 아예 없는 한
// 덩어리가 된다. 두 극단이 화면에서는 똑같이 읽기 나쁘다 — 앞은 성기고 뒤는 벽이다.
//
// 정돈은 **표시 시점에만** 한다. 저장된 값은 그대로 두므로 이미 등록된 원두도 함께 고쳐지고,
// 규칙이 마음에 안 들면 규칙만 되돌리면 된다. 그리고 **내용은 한 글자도 버리지 않는다**.

/** 줄바꿈이 없는 덩어리를 문장으로 쪼갤 기준 길이 (한글 기준 약 4~5줄) */
const RUN_ON = 100;
/** 문단 하나가 커져도 되는 상한 — 넘으면 합치지 않고 끊는다 */
const PARA_MAX = 140;

/** 문장이 끝났는가 — 한국어의 "…습니다." 도 마침표로 끝나므로 구두점만 본다 */
const endsSentence = (s: string): boolean => /[.!?]["')\]]*$/.test(s);

/**
 * 줄바꿈 없는 긴 덩어리를 문장 경계로 쪼갠다.
 *
 * 마침표 **뒤에 공백이 오는 자리**에서만 끊으므로 "2026.09.01"이나 "v1.2.0"은 갈라지지 않는다.
 * 끊을 자리가 없으면(마침표를 안 쓴 글) 통째로 둔다 — 임의의 길이로 자르지 않는다.
 */
function splitRunOn(block: string): string[] {
  if (block.includes("\n") || block.length <= RUN_ON) return [block];
  const sentences = block.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length < 2) return [block];
  const out: string[] = [];
  for (const s of sentences) {
    const last = out[out.length - 1];
    if (last && last.length + s.length + 1 <= PARA_MAX) out[out.length - 1] = `${last} ${s}`;
    else out.push(s);
  }
  return out;
}

/**
 * 짧은 산문 문단들을 합친다 — 문장마다 빈 줄이 끼어 성긴 글을 되붙이는 쪽.
 *
 * 합치는 조건을 "둘 다 문장으로 끝난다"로 잡은 이유: 제목("Fruity Bark Blend"), 항목
 * ("ORIGIN - 2026.09.01"), 구성 목록("… Natural 50%")은 구두점으로 끝나지 않는다. 그 셋은
 * 줄 자체가 의미라 붙이면 안 되고, 이 조건 하나가 셋을 모두 걸러 낸다.
 * 줄바꿈을 품은 덩어리도 건드리지 않는다 — 그 줄바꿈은 사용자가 의도한 것이다.
 */
function mergeShortProse(blocks: string[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    const mergeable =
      prev !== undefined &&
      !prev.includes("\n") &&
      !b.includes("\n") &&
      endsSentence(prev) &&
      endsSentence(b) &&
      prev.length + b.length + 1 <= PARA_MAX;
    if (mergeable) out[out.length - 1] = `${prev} ${b}`;
    else out.push(b);
  }
  return out;
}

/**
 * 정돈되지 않은 메모 덩어리 → 문단 배열.
 *
 * 문단 안의 단일 줄바꿈은 **살린다** — 블렌드 구성처럼 줄 자체가 의미인 경우가 있어서다.
 * 문단 사이 간격은 빈 줄이 아니라 CSS가 준다(`.memo-body p`).
 */
export function normalizeMemo(raw: string): string[] {
  const lines = String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim()); // 옮겨 붙일 때 딸려 오는 들여쓰기·꼬리 공백을 여기서 턴다

  // 빈 줄이 몇 개든 문단 경계 하나로 — "너무 많은 줄바꿈" 쪽의 처리
  const blocks: string[] = [];
  let cur: string[] = [];
  for (const l of lines) {
    if (l) cur.push(l);
    else if (cur.length) {
      blocks.push(cur.join("\n"));
      cur = [];
    }
  }
  if (cur.length) blocks.push(cur.join("\n"));

  return mergeShortProse(blocks.flatMap(splitRunOn));
}
