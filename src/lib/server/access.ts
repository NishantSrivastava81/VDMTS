import "server-only";

export const ACCESS_COOKIE = "nt_access";
const COOKIE_VERSION = "v1";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

/**
 * A household gate, not a parental lock: it only stops unknown internet users
 * from spending the Azure subscription. It never affects solution access.
 */
export async function signAccessCookie(secret: string, issuedAt = Date.now()): Promise<string> {
  const signature = await hmac(secret, payload(issuedAt));
  return `${issuedAt}.${signature}`;
}

export async function verifyAccessCookie(
  secret: string,
  value: string | undefined,
): Promise<boolean> {
  if (!value) {
    return false;
  }

  const separator = value.lastIndexOf(".");
  if (separator <= 0) {
    return false;
  }

  const issuedAtRaw = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const issuedAt = Number(issuedAtRaw);

  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) {
    return false;
  }
  if (Date.now() - issuedAt > MAX_AGE_SECONDS * 1000) {
    return false;
  }

  const expected = await hmac(secret, payload(issuedAt));
  return timingSafeEqual(signature, expected);
}

export function accessCookieOptions() {
  return {
    name: ACCESS_COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}

/** Constant-time comparison of the supplied access code. */
export function codesMatch(supplied: string, expected: string): boolean {
  return timingSafeEqual(supplied, expected);
}

function payload(issuedAt: number): string {
  return `${ACCESS_COOKIE}:${COOKIE_VERSION}:${issuedAt}`;
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return base64Url(new Uint8Array(signature));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  // Compare a fixed number of positions so length alone does not leak via timing.
  const length = Math.max(aBytes.length, bBytes.length);
  let difference = aBytes.length ^ bBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (aBytes[index] ?? 0) ^ (bBytes[index] ?? 0);
  }

  return difference === 0;
}
