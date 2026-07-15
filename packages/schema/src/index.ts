// Bean-Hoarder 도메인 스키마 — 원두 필드의 단일 소스(single source of truth).
// DB 컬럼명·CSV 헤더·API 페이로드 키·필수 규칙·표시 라벨이 전부 BEAN_FIELDS 하나에서 파생된다.
// 필드를 추가할 때는 이 배열에 한 줄 추가 + D1 마이그레이션 SQL 작성이 전부여야 한다.
import { z } from "zod";

export const KEY_RE = /^[A-Z0-9]{4}\d{2}-\d{3}$/;
export const PIN_RE = /^\d{4}$/;
export const USERCODE_RE = /^[A-Z0-9]{4}$/;

/** 필드별 저장 길이 상한 — 라벨·조회 페이지 표시에 충분한 수준으로 자른다 */
export const MAX_FIELD_LEN = 1000;
export const ROASTERY_MAX_LEN = 200;

/** 로고 dataURL 검증: 허용 포맷 + 크기 상한(base64 문자열 약 140KB ≈ 원본 100KB) */
export const LOGO_DATAURL_RE = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
export const LOGO_MAX_LEN = 140_000;

/**
 * required:
 *  - "always" — 등록·수정·CSV 복원 모두 필수
 *  - "write"  — 등록·수정만 필수 (품종·가공방식 필수화 이전 백업도 복원돼야 하므로 import에선 완화)
 */
export interface BeanFieldDef {
  /** D1 컬럼명 (snake_case) */
  readonly column: string;
  /** CSV 헤더 · API 페이로드 키 (UPPER_SNAKE) */
  readonly csv: string;
  /** 필수 항목일 때의 한국어 라벨 (오류 메시지에 사용) */
  readonly label?: string;
  readonly required?: "always" | "write";
}

export const BEAN_FIELDS = [
  { column: "origin", csv: "ORIGIN", label: "국가(산지)", required: "always" },
  { column: "region", csv: "REGION" },
  { column: "producer", csv: "PRODUCER" },
  { column: "lot", csv: "LOT" },
  { column: "washing_station", csv: "WASHING_STATION" },
  { column: "variety", csv: "VARIETY", label: "품종", required: "write" },
  { column: "process", csv: "PROCESS", label: "가공방식", required: "write" },
  { column: "altitude", csv: "ALTITUDE" },
  { column: "harvest", csv: "HARVEST" },
  { column: "roast_date", csv: "ROAST_DATE", label: "로스팅일", required: "always" },
  { column: "package_date", csv: "PACKAGE_DATE", label: "패키징일", required: "always" },
  { column: "net_weight", csv: "NET_WEIGHT" },
  { column: "agtron", csv: "AGTRON" },
  { column: "tasting_note", csv: "TASTING_NOTE" },
  { column: "memo", csv: "MEMO" },
  { column: "source_url", csv: "SOURCE_URL" },
] as const satisfies readonly BeanFieldDef[];

export type BeanColumn = (typeof BEAN_FIELDS)[number]["column"];
export type BeanCsvKey = (typeof BEAN_FIELDS)[number]["csv"];

// as const 리터럴 유니온에는 옵션 속성이 없는 멤버가 섞여 있어, 파생 계산은 넓힌 타입으로 순회한다.
const FIELD_DEFS: readonly BeanFieldDef[] = BEAN_FIELDS;

/** D1 컬럼명 목록 (beans 테이블의 자유 필드, key/usercode/roastery/archived 제외) */
export const FIELDS: readonly BeanColumn[] = BEAN_FIELDS.map((f) => f.column);

/** CSV 백업 헤더 (KEY·ROASTERY 고정 선두 + 필드 순서) */
export const CSV_HEADERS: readonly string[] = ["KEY", "ROASTERY", ...BEAN_FIELDS.map((f) => f.csv)];

/** 등록·수정 필수 항목: column → 한국어 라벨 */
export const REQUIRED_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  FIELD_DEFS.filter((f) => f.required).map((f) => [f.column, f.label as string]),
);

/** CSV 복원(import) 전용 완화 집합 — 필수화 이전 백업 호환 */
export const IMPORT_REQUIRED_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  FIELD_DEFS.filter((f) => f.required === "always").map((f) => [f.column, f.label as string]),
);

/** beans 테이블 행 (DB 컬럼명 기준) */
export type BeanRow = {
  key: string;
  usercode: string;
  roastery: string;
  archived: number | boolean;
} & Record<BeanColumn, string>;

/** 공개 API 표현 (CSV 헤더 키 기준) */
export type BeanPublic = { KEY: string; ROASTERY: string; ARCHIVED: boolean } & Record<BeanCsvKey, string>;

/** DB 행 → 공개 JSON. 키 순서는 CSV_HEADERS와 동일, ARCHIVED는 마지막. */
export function beanToPublic(row: BeanRow): BeanPublic {
  const out: Record<string, unknown> = { KEY: row.key, ROASTERY: row.roastery };
  for (const f of BEAN_FIELDS) out[f.csv] = row[f.column];
  out.ARCHIVED = !!row.archived;
  return out as BeanPublic;
}

/** 임의 페이로드에서 필드 값을 추출 — 문자열화·trim·길이 상한. (기존 _lib.js pickFields와 동일 동작) */
export function pickFields(body: Record<string, unknown>): Record<BeanColumn, string> {
  const vals = {} as Record<BeanColumn, string>;
  for (const f of BEAN_FIELDS) {
    const raw = body[f.csv];
    vals[f.column] = String(raw || "")
      .trim()
      .slice(0, MAX_FIELD_LEN);
  }
  return vals;
}

/** 필수 항목 검사 — 누락된 항목의 한국어 라벨 목록 반환 (로스터리 우선) */
export function missingRequired(
  roastery: string,
  vals: Record<BeanColumn, string>,
  labels: Readonly<Record<string, string>> = REQUIRED_LABELS,
): string[] {
  const missing: string[] = [];
  if (!roastery) missing.push("로스터리");
  for (const [field, label] of Object.entries(labels)) {
    if (!vals[field as BeanColumn]) missing.push(label);
  }
  return missing;
}

// ── 요청 바디 스키마 (Zod) ────────────────────────────────────
// 기존 API는 잘못된 JSON을 {}로 받아 필드별 수동 코어싱을 했다 — 계약을 보존하기 위해
// 느슨한 unknown → 문자열 변환을 스키마로 명시한다. (falsy는 빈 문자열: String(v || ""))

const looseString = z
  .unknown()
  .transform((v) => String(v || "").trim())
  .pipe(z.string());

export const signupBodySchema = z
  .object({ invite: z.unknown().optional(), password: looseString.catch("") })
  .catch({ invite: undefined, password: "" });

export const loginBodySchema = z
  .object({ usercode: looseString.catch(""), password: looseString.catch("") })
  .catch({ usercode: "", password: "" });

export const recoverBodySchema = z
  .object({ recovery_key: looseString.catch(""), password: looseString.catch("") })
  .catch({ recovery_key: "", password: "" });

export const archiveBodySchema = z
  .object({ archived: z.unknown().transform((v) => !!v) })
  .catch({ archived: false });

// 로고의 로스터리명은 R2 오브젝트 키({usercode}/{roastery})에 그대로 들어간다.
// R2 키는 평면 문자열이라 경로 탐색은 성립하지 않지만, 구분자(/·역슬래시)가 섞이면
// 키 구조가 흐려지므로 심층 방어로 제거한다.
const roasteryName = (s: string) => s.toUpperCase().replace(/[/\\]/g, "");

export const logoPutBodySchema = z
  .object({
    roastery: looseString.transform((s) => roasteryName(s).slice(0, 80)).catch(""),
    data_url: z
      .unknown()
      .transform((v) => String(v || ""))
      .catch(""),
  })
  .catch({ roastery: "", data_url: "" });

export const logoDeleteBodySchema = z
  .object({ roastery: looseString.transform(roasteryName).catch("") })
  .catch({ roastery: "" });

export const fetchBodySchema = z
  .object({
    url: z
      .unknown()
      .transform((v) => String(v || ""))
      .catch(""),
  })
  .catch({ url: "" });
