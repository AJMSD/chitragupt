const SESSION_COOKIE_NAME = "ajmsd_session";
const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type SessionPayload = {
  sub: "owner";
  iat: number;
  exp: number;
};

function getAuthSecret(): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.trim().length === 0) return null;
  return secret;
}

function getAuthPassword(): string | null {
  const password = process.env.AUTH_PASSWORD;
  if (!password || password.trim().length === 0) return null;
  return password;
}

function getSessionMaxAgeSeconds(): number {
  const raw = process.env.AUTH_SESSION_MAX_AGE_SECONDS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_SESSION_MAX_AGE_SECONDS;
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(base64Url: string): Uint8Array {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = padded.length % 4 === 0 ? 0 : 4 - (padded.length % 4);
  const base64 = padded + "=".repeat(padLength);
  return fromBase64(base64);
}

function encodeString(value: string): Uint8Array {
  return encoder.encode(value);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function decodeString(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto API unavailable");
  }

  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    toArrayBuffer(encodeString(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    toArrayBuffer(encodeString(data))
  );

  return new Uint8Array(signature);
}

export function getSafeRedirectPath(target?: string | null): string {
  if (!target) return "/app";
  if (!target.startsWith("/")) return "/app";
  if (target.startsWith("//")) return "/app";
  if (target.includes("://")) return "/app";
  return target;
}

export function getSessionCookieSettings() {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getSessionMaxAgeSeconds(),
  };
}

export async function verifyPassword(candidate: string): Promise<boolean> {
  const expected = getAuthPassword();
  if (!expected) return false;
  return timingSafeEqual(encodeString(candidate), encodeString(expected));
}

export async function createSessionToken(): Promise<string | null> {
  const secret = getAuthSecret();
  if (!secret) return null;

  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: "owner",
    iat: now,
    exp: now + getSessionMaxAgeSeconds(),
  };

  const payloadRaw = JSON.stringify(payload);
  const payloadEncoded = toBase64Url(encodeString(payloadRaw));
  const signature = await hmacSha256(secret, payloadEncoded);
  const signatureEncoded = toBase64Url(signature);

  return `${payloadEncoded}.${signatureEncoded}`;
}

export async function verifySessionToken(
  token: string | null | undefined
): Promise<SessionPayload | null> {
  const secret = getAuthSecret();
  if (!secret || !token) return null;

  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) return null;

  let payloadBytes: Uint8Array;
  try {
    payloadBytes = fromBase64Url(payloadPart);
  } catch {
    return null;
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(decodeString(payloadBytes)) as SessionPayload;
  } catch {
    return null;
  }

  if (payload.sub !== "owner") return null;
  if (typeof payload.exp !== "number" || typeof payload.iat !== "number") {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return null;

  let expectedSignature: Uint8Array;
  try {
    expectedSignature = await hmacSha256(secret, payloadPart);
  } catch {
    return null;
  }

  let actualSignature: Uint8Array;
  try {
    actualSignature = fromBase64Url(signaturePart);
  } catch {
    return null;
  }

  if (!timingSafeEqual(expectedSignature, actualSignature)) {
    return null;
  }

  return payload;
}

export function isAuthConfigured(): boolean {
  return Boolean(getAuthPassword() && getAuthSecret());
}

export { SESSION_COOKIE_NAME };
export type { SessionPayload };
