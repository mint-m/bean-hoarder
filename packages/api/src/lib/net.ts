// 링크 가져오기 프록시의 SSRF 가드와 HTML 텍스트 추출.

export function isPrivateIp(ip: string): boolean {
  // IPv6 (v4-mapped 포함)
  if (ip.includes(":")) {
    const low = ip.toLowerCase();
    if (low === "::1" || low === "::") return true;
    if (/^f[cd]/.test(low)) return true; // fc00::/7 (ULA)
    if (/^fe[89ab]/.test(low)) return true; // fe80::/10 (link-local)
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(low);
    if (mapped?.[1]) return isPrivateIp(mapped[1]);
    return false;
  }
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local / 클라우드 메타데이터
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

export function hostBlocked(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (/\.(local|internal)$/.test(h)) return true;
  if (h === "metadata.google.internal") return true;
  if (/^[\d.]+$/.test(h) || h.includes(":")) return isPrivateIp(h);
  return false;
}

export function htmlToText(html: string): string {
  const s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // 표/정의목록의 키-값 셀을 "라벨: 값" 줄로 변환해 autofill 파서가 읽을 수 있게 한다
    .replace(/<\/(th|dt|td)>/gi, ": ")
    .replace(/<\/(tr|p|div|li|h[1-6]|dd|section|article|header|footer)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  return s
    .split("\n")
    .map((l) =>
      l
        .replace(/[ \t]+/g, " ")
        .trim()
        .replace(/[:：]$/, ""),
    )
    .filter(Boolean)
    .join("\n");
}
