// 라벨 디자인 설정: localStorage(bh_design) 영속화 — 구 admin과 키·형식 호환 (lab.js에서 이식).
import {
  DEFAULT_DESIGN,
  type LabelDesign,
  SIZE_DEFAULT_FIELDS,
  SIZE_SPECS,
  SPEC_POOL,
  SUB_POOL,
} from "@bnhd/label";

export function loadDesign(): LabelDesign {
  const d = structuredClone(DEFAULT_DESIGN);
  try {
    const saved = JSON.parse(localStorage.getItem("bh_design") || "{}");
    if (SIZE_SPECS[saved.size]) d.size = saved.size;
    const S = SIZE_SPECS[d.size];
    if (!S) return d;
    if (typeof saved.headlineSize === "number")
      d.headlineSize = Math.min(S.headline.max, Math.max(S.headline.min, saved.headlineSize));
    else d.headlineSize = S.headline.def;
    if (typeof saved.specValueSize === "number")
      d.specValueSize = Math.min(S.specVal.max, Math.max(S.specVal.min, saved.specValueSize));
    else d.specValueSize = S.specVal.def;
    if (saved.colorMode === "mono" || saved.colorMode === "color") d.colorMode = saved.colorMode;
    const subKeys = SUB_POOL.map(([k]) => k);
    const specKeys = SPEC_POOL.map(([k]) => k);
    if (Array.isArray(saved.subFields))
      d.subFields = saved.subFields.filter((k: string) => subKeys.includes(k)).slice(0, 3);
    if (Array.isArray(saved.specFields))
      d.specFields = saved.specFields.filter((k: string) => specKeys.includes(k)).slice(0, 8);
    if (typeof saved.showLogo === "boolean") d.showLogo = saved.showLogo;
  } catch (_e) {
    /* 손상된 저장값은 기본값으로 */
  }
  return d;
}

export function saveDesign(design: LabelDesign): void {
  localStorage.setItem("bh_design", JSON.stringify(design));
}

/** design.specFields 우선순위(SPEC_POOL 순서) 자리에 새 항목을 끼워 넣는다 */
export function insertByPriority(specFields: string[], key: string): string[] {
  const order = SPEC_POOL.map(([k]) => k);
  const rank = (k: string) => order.indexOf(k);
  const idx = specFields.findIndex((k) => rank(k) > rank(key));
  const next = [...specFields];
  if (idx === -1) next.push(key);
  else next.splice(idx, 0, key);
  return next;
}

export function sameFieldSet(a: string[] | undefined, b: string[] | undefined): boolean {
  return !!a && !!b && a.length === b.length && a.every((k) => b.includes(k));
}

/**
 * 사이즈 변경: 사용자가 직접 커스터마이즈하지 않은(=이전 사이즈 기본값 그대로인) 표시 항목만
 * 새 사이즈의 기본값으로 바꾼다 — 이미 손댄 토글은 사이즈를 바꿔도 유지 (lab.js selectSize와 동일).
 */
export function designForSize(design: LabelDesign, sizeKey: string): LabelDesign {
  const S = SIZE_SPECS[sizeKey];
  if (!S) return design;
  const prevDefaults = SIZE_DEFAULT_FIELDS[design.size];
  const subCustomized = !sameFieldSet(design.subFields, prevDefaults?.subFields);
  const specCustomized = !sameFieldSet(design.specFields, prevDefaults?.specFields);
  const nextDefaults = SIZE_DEFAULT_FIELDS[sizeKey];
  return {
    ...design,
    size: sizeKey,
    headlineSize: S.headline.def,
    specValueSize: S.specVal.def,
    subFields: !subCustomized && nextDefaults ? [...nextDefaults.subFields] : design.subFields,
    specFields: !specCustomized && nextDefaults ? [...nextDefaults.specFields] : design.specFields,
  };
}
