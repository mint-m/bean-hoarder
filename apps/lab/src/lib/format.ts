// 날짜·단위·텍스트 포맷 유틸 (lab.js에서 이식).

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

export function download(filename: string, blob: Blob | null): void {
  if (!blob) return; // Blob 생성 실패(캔버스 오염 등) 시 조용히 무시 — createObjectURL(null)은 런타임 에러
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.click();
  // 즉시 revoke하면 일부 브라우저에서 다운로드가 시작되기 전에 URL이 해제될 수 있다
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * 이미지 Blob을 클립보드에 복사. 실패하면 blob을 돌려줘 호출부가 다운로드로 폴백한다.
 * (QR 생성 자체는 하지 않는다 — 인쇄 기하의 단일 소스는 @bnhd/label의 buildQrSVG다.)
 */
export async function copyImage(blob: Blob): Promise<{ ok: boolean; blob: Blob }> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return { ok: true, blob };
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
