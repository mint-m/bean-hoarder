// 폼 상태 — API/CSV 키(UPPER_SNAKE)로 키잉하되 값은 입력 원문을 담는다.
// ALTITUDE·NET_WEIGHT는 단위 없이(저장 시 m/g 자동 부착), ROAST_DATE·PACKAGE_DATE는 ISO(yyyy-mm-dd).
import { isoOffset } from "./lib/format";

export interface FormState {
  ROASTERY: string;
  ORIGIN: string;
  COFFEE_NAME: string;
  REGION: string;
  PRODUCER: string;
  LOT: string;
  WASHING_STATION: string;
  VARIETY: string;
  PROCESS: string;
  ALTITUDE: string;
  HARVEST: string;
  ROAST_DATE: string;
  PACKAGE_DATE: string;
  NET_WEIGHT: string;
  AGTRON: string;
  TASTING_NOTE: string;
  MEMO: string;
  SOURCE_URL: string;
}

export type FormKey = keyof FormState;

export function emptyForm(): FormState {
  return {
    ROASTERY: "",
    ORIGIN: "",
    COFFEE_NAME: "",
    REGION: "",
    PRODUCER: "",
    LOT: "",
    WASHING_STATION: "",
    VARIETY: "",
    PROCESS: "",
    ALTITUDE: "",
    HARVEST: "",
    ROAST_DATE: isoOffset(-10),
    PACKAGE_DATE: isoOffset(0),
    NET_WEIGHT: "",
    AGTRON: "",
    TASTING_NOTE: "",
    MEMO: "",
    SOURCE_URL: "",
  };
}

export interface BeanPublicRow extends Record<string, unknown> {
  KEY: string;
  ROASTERY: string;
  ORIGIN: string;
  ROAST_DATE: string;
  ARCHIVED: boolean;
}

export interface StatusLine {
  msg: string;
  cls: string; // "ok" | "error" | "loading" | ""
}
