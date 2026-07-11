// 암호 해시·유저코드·복구키 생성 (Web Crypto — Workers/Node 공통).

/** 혼동 문자(0/O/1/I/L)를 뺀 유저코드 문자셋 */
export const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function bufToHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const pairs = hex.match(/.{2}/g) || [];
  return new Uint8Array(pairs.map((h) => Number.parseInt(h, 16)));
}

export async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return bufToHex(buf);
}

// 암호 해시: PBKDF2-SHA256. 4자리 PIN이라 오프라인 크래킹을 완전히 막을 수는 없지만
// (위협 모델상 수용), 단일 SHA-256 대비 무차별 대입 비용을 반복 횟수만큼 올린다.
// 반복 횟수는 Workers 무료 CPU 한도(10ms) 안에서 여유 있게 동작하는 값으로 선택.
const PBKDF2_ITER = 25000;

async function pbkdf2hex(password: string, saltBytes: Uint8Array, iterations: number): Promise<string> {
  const keyMat = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations },
    keyMat,
    256,
  );
  return bufToHex(bits);
}

export async function hashPassword(usercode: string, pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const h = await pbkdf2hex(`${usercode}:${pin}`, salt, PBKDF2_ITER);
  return `pbkdf2$${PBKDF2_ITER}$${bufToHex(salt)}$${h}`;
}

/**
 * 저장된 해시 검증. 구형(단일 SHA-256 hex 64자) 해시도 인식해 legacy=true로 알려주면
 * 호출부가 로그인 성공 시점에 PBKDF2로 무중단 재해시한다.
 */
export async function verifyPassword(
  stored: string | null | undefined,
  usercode: string,
  pin: string,
): Promise<{ ok: boolean; legacy: boolean }> {
  if ((stored || "").startsWith("pbkdf2$")) {
    const [, iterS, saltHex, hash] = (stored as string).split("$");
    if (!iterS || !saltHex || !hash) return { ok: false, legacy: false };
    const h = await pbkdf2hex(`${usercode}:${pin}`, hexToBytes(saltHex), Number.parseInt(iterS, 10));
    return { ok: h === hash, legacy: false };
  }
  const h = await sha256hex(`${usercode}:${pin}`);
  return { ok: h === stored, legacy: true };
}

export function randomUsercode(): string {
  const a = new Uint32Array(4);
  crypto.getRandomValues(a);
  let s = "";
  for (let i = 0; i < 4; i++) s += CODE_CHARS[(a[i] as number) % CODE_CHARS.length];
  return s;
}

/** 오프라인 백업용 고엔트로피 복구키: 20자 hex, 4자리씩 하이픈 표시 (예: F89E-5079-5A48-3F33-62B0) */
export function randomRecoveryKey(): string {
  const a = new Uint8Array(10);
  crypto.getRandomValues(a);
  const hex = [...a]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return (hex.match(/.{1,4}/g) || []).join("-");
}

/** 세션 토큰: bhs_ 접두 + 32자 hex (128비트). 서버엔 SHA-256 해시만 저장한다. */
export function randomSessionToken(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return `bhs_${[...a].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function normalizeRecoveryKey(k: unknown): string {
  return String(k || "")
    .replace(/[^0-9A-Fa-f]/g, "")
    .toUpperCase();
}
