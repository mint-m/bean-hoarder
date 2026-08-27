// @bnhd/label · @bnhd/autofill — JS 모듈의 최소 타입 선언 (Phase 3 이후 TS화 예정)
declare module "@bnhd/label" {
  export const BASE_URL: string;
  export const SPEC_POOL: [string, string, string][];
  export const SUB_POOL: [string, string][];
  export const SIZE_SPECS: Record<
    string,
    {
      label: string;
      W: number;
      H: number;
      margin: number;
      col2: number;
      specLH: number;
      qrDots: number;
      headline: { min: number; max: number; def: number };
      specVal: { min: number; max: number; def: number };
    }
  >;
  export const SIZE_DEFAULT_FIELDS: Record<string, { subFields: string[]; specFields: string[] }>;
  export interface LabelDesign {
    size: string;
    headlineSize: number;
    specValueSize: number;
    colorMode: "mono" | "color";
    subFields: string[];
    specFields: string[];
    showLogo: boolean;
  }
  export const DEFAULT_DESIGN: LabelDesign;
  export function buildLabelSVG(
    row: Record<string, string>,
    design?: LabelDesign,
    logoDataUrl?: string | null,
  ): { svg: string; content: string; moduleCount: number; W: number; H: number };
  export const QR_DOT_OPTIONS: number[];
  export function qrSizeMM(dots: number, moduleCount: number): number;
  export function buildQrSVG(
    key: string,
    dots?: number,
  ): { svg: string; content: string; moduleCount: number; codeSize: number; size: number };
  export function renderCanvas(svg: string, dpi: number): Promise<HTMLCanvasElement>;
  export function renderPngBlob(svg: string, dpi: number): Promise<Blob>;
  export function verifyQr(svg: string, expectedContent: string, dpi?: number): Promise<{ ok: boolean }>;
}

declare module "@bnhd/autofill" {
  export function parseBeanText(text: string): Record<string, string>;
  export const FIELD_LABELS_KO: Record<string, string>;
}
