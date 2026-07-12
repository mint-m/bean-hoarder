// API 호출 헬퍼 — lab.js api()와 동일한 { status, body } 패턴.
export interface ApiResult<T = Record<string, unknown>> {
  status: number;
  body: (T & { ok?: boolean; error?: string }) | null;
  raw: Response | null;
}

export async function api<T = Record<string, unknown>>(
  path: string,
  token: string,
  opts: RequestInit = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  try {
    const res = await fetch(path, { ...opts, headers });
    let body = null;
    try {
      body = await res.json();
    } catch (_e) {
      /* JSON 아님 */
    }
    return { status: res.status, body, raw: res };
  } catch (_e) {
    // 네트워크 자체가 끊긴 경우 — 호출부는 body.ok 패턴으로만 확인하므로 같은 모양으로 돌려준다
    return {
      status: 0,
      body: { ok: false, error: "네트워크 연결 오류가 발생했습니다. 인터넷 연결을 확인해 주세요." } as never,
      raw: null,
    };
  }
}
