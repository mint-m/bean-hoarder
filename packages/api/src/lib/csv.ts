// CSV 직렬화·파싱.
// 내보내기: 스프레드시트 수식 인젝션 방지 — 셀이 수식 트리거 문자로 시작하면 ' 접두.
// 가져오기: 같은 규칙으로 붙은 ' 접두를 되돌려 라운드트립을 보존한다.

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function guardCsvCell(v: string): string {
  return FORMULA_TRIGGER.test(v) ? `'${v}` : v;
}

export function unguardCsvCell(v: string): string {
  if (typeof v !== "string") return v;
  return v.startsWith("'") && FORMULA_TRIGGER.test(v.slice(1)) ? v.slice(1) : v;
}

export function csvField(v: unknown): string {
  const s = guardCsvCell((v ?? "").toString());
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 파서 (따옴표·개행 포함 셀 지원). BOM 제거 후 행 배열의 배열을 반환. */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (s.charAt(i + 1) === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s.charAt(i + 1) === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // 완전히 빈 행 제거
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
