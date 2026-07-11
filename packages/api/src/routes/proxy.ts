// 링크 가져오기 프록시 (로그인 사용자 전용).
// 브라우저 CORS를 우회해 상품 페이지 텍스트/로고 이미지를 대신 가져온다.
// SSRF 가드: http(s)만, 내부망·메타데이터 호스트 차단(문자열 + DoH 리졸브 검사),
// 리다이렉트는 수동으로 따라가며 매 홉 재검사, 크기 2MB·8초 제한.
import { fetchBodySchema } from "@bnhd/schema";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { json } from "../lib/http";
import { hostBlocked, htmlToText, isPrivateIp } from "../lib/net";

interface DohAnswer {
  type: number;
  data: string;
}

// DoH(cloudflare-dns.com)로 A/AAAA를 조회해 사설 대역으로 리졸브되는 호스트를 차단.
// DoH 실패 시에는 통과시킨다(fail-open) — Workers의 외부 fetch는 어차피 사설망에
// 닿지 않아 이 검사는 심층 방어이며, DoH 장애로 기능 전체가 죽는 것을 피한다.
async function resolvesToPrivate(host: string): Promise<boolean> {
  if (/^[\d.]+$/.test(host) || host.includes(":")) return isPrivateIp(host.replace(/^\[|\]$/g, ""));
  for (const type of ["A", "AAAA"]) {
    try {
      const r = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
        { headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(4000) },
      );
      if (!r.ok) continue;
      const d = (await r.json()) as { Answer?: DohAnswer[] };
      for (const a of d.Answer || []) {
        if ((a.type === 1 || a.type === 28) && isPrivateIp(String(a.data))) return true;
      }
    } catch (_e) {
      /* fail-open */
    }
  }
  return false;
}

async function checkTargetUrl(url: URL): Promise<string | null> {
  if (!/^https?:$/.test(url.protocol)) return "http/https URL만 지원합니다.";
  if (hostBlocked(url.hostname)) return "허용되지 않는 주소입니다.";
  if (await resolvesToPrivate(url.hostname)) return "허용되지 않는 주소입니다.";
  return null;
}

export async function fetchExternal(c: Context<AppEnv>): Promise<Response> {
  const body = fetchBodySchema.parse(await c.req.json().catch(() => ({})));
  let url: URL;
  try {
    url = new URL(body.url);
  } catch (_e) {
    return json({ ok: false, error: "URL 형식이 올바르지 않습니다." }, 400);
  }

  let res: Response | null = null;
  for (let hop = 0; hop < 5; hop++) {
    const blocked = await checkTargetUrl(url);
    if (blocked) return json({ ok: false, error: blocked }, 400);
    try {
      res = await fetch(url.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (compatible; BeanHoarder/1.0)",
          Accept: "text/html,application/xhtml+xml,image/*;q=0.9,*/*;q=0.8",
          "Accept-Language": "ko,en;q=0.8",
        },
      });
    } catch (_e) {
      return json({ ok: false, error: "대상 페이지를 가져오지 못했습니다 (차단 또는 시간 초과)." }, 502);
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) break;
      try {
        url = new URL(loc, url);
      } catch (_e) {
        return json({ ok: false, error: "리다이렉트 주소가 올바르지 않습니다." }, 502);
      }
      res = null;
      continue;
    }
    break;
  }
  if (!res) return json({ ok: false, error: "리다이렉트가 너무 많습니다." }, 502);
  if (!res.ok) return json({ ok: false, error: `대상 응답 오류 (HTTP ${res.status})` }, 502);

  const buf = await res.arrayBuffer();
  if (buf.byteLength > 2_000_000) return json({ ok: false, error: "응답이 너무 큽니다 (2MB 제한)." }, 413);
  const ct = (res.headers.get("content-type") || "").toLowerCase();

  if (ct.startsWith("image/")) {
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return json({ ok: true, kind: "image", dataUrl: `data:${ct.split(";")[0]};base64,${btoa(bin)}` });
  }

  const text = htmlToText(new TextDecoder("utf-8").decode(buf));
  if (!text.trim()) return json({ ok: false, error: "텍스트를 추출하지 못했습니다." }, 422);
  return json({ ok: true, kind: "text", text: text.slice(0, 20000) });
}
