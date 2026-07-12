// data URL ↔ 바이트 변환 (로고 R2 저장용).

export interface ParsedDataUrl {
  contentType: string;
  bytes: Uint8Array;
}

/** LOGO_DATAURL_RE를 통과한 data URL을 MIME 타입과 바이트로 분해한다. */
export function parseDataUrl(dataUrl: string): ParsedDataUrl | null {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m?.[1] || m[2] === undefined) return null;
  try {
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { contentType: m[1], bytes };
  } catch (_e) {
    return null;
  }
}

export function bytesToDataUrl(contentType: string, buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${contentType};base64,${btoa(bin)}`;
}
