// 날짜·단위·텍스트 포맷 유틸 (lab.js에서 이식).

import { BASE_URL } from "@bnhd/label";
import qrcode from "qrcode-generator";

/** <input type=date>(ISO) → 저장 포맷(yy.mm.dd) */
export function isoToDot(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${(m[1] as string).slice(2)}.${m[2]}.${m[3]}` : "";
}

/** 저장 포맷(yy.mm.dd) → ISO */
export function dotToIso(dot: string): string {
  const m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(dot || "");
  return m ? `20${m[1]}-${m[2]}-${m[3]}` : "";
}

export function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 용량·고도: 숫자만 입력하면 저장 시 단위(g/m) 자동 부착 */
export function withUnit(v: string, unit: string): string {
  const s = v.trim();
  if (!s) return "";
  return /^[\d\s.~\-–]+$/.test(s) && /\d/.test(s) ? s.replace(/\s+/g, "") + unit : s;
}

/** Flavor Notes: 콤마로 구분된 각 항목의 첫 영문자만 대문자로 보정 */
export function capitalizeNoteSegments(text: string): string {
  return text.replace(/(^|,\s*)([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_e) {
    /* 권한 차단 시 레거시 방식 폴백 */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:absolute;left:-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (_e) {
    return false;
  }
}

export function download(filename: string, blob: Blob): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** QR 단독 이미지(콰이엇존 4모듈 포함, 512px급)를 클립보드에 복사 */
export async function copyQrImage(key: string): Promise<{ ok: boolean; blob?: Blob }> {
  const qr = qrcode(0, "M");
  qr.addData(`${BASE_URL}/${key}`, "Alphanumeric");
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  const scale = 16;
  const size = (n + quiet * 2) * scale;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) return { ok: false };
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return { ok: true };
  } catch (_e) {
    return { ok: false, blob };
  }
}

/** 로고 원본을 라벨 해상도에 맞게 축소(긴 변 256px, PNG). SVG는 벡터 그대로 유지. */
export function downscaleLogo(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (dataUrl.startsWith("data:image/svg")) {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const max = 256;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (Math.max(w, h) > max) {
        const k = max / Math.max(w, h);
        w = Math.max(1, Math.round(w * k));
        h = Math.max(1, Math.round(h * k));
      }
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      (c.getContext("2d") as CanvasRenderingContext2D).drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
