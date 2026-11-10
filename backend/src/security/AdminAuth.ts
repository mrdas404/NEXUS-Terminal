import { createHmac, timingSafeEqual } from 'node:crypto';

export const ADMIN_SESSION_COOKIE = 'nexus_admin_session';
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

interface SessionPayload {
  exp: number;
  iat: number;
}

export function safeTextEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(actual, 'utf8');
  if (left.length !== right.length) {
    const padded = Buffer.alloc(left.length);
    right.copy(padded, 0, 0, Math.min(right.length, padded.length));
    timingSafeEqual(left, padded);
    return false;
  }
  return timingSafeEqual(left, right);
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createAdminSession(secret: string, now = Date.now()): string {
  const payload: SessionPayload = {
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + ADMIN_SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return encoded + '.' + sign(encoded, secret);
}

export function verifyAdminSession(token: string | undefined, secret: string, now = Date.now()): boolean {
  if (!token || !secret || token.length > 2048) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [encoded, signature] = parts;
  if (!encoded || !signature) return false;
  const expected = sign(encoded, secret);
  if (!safeTextEqual(expected, signature)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    const current = Math.floor(now / 1000);
    return Number.isSafeInteger(payload.iat) && Number.isSafeInteger(payload.exp) &&
      payload.iat <= current + 60 && payload.exp > current &&
      payload.exp - payload.iat === ADMIN_SESSION_TTL_SECONDS;
  } catch {
    return false;
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === name) {
      try { return decodeURIComponent(item.slice(separator + 1).trim()); }
      catch { return undefined; }
    }
  }
  return undefined;
}

export function isAdminSessionValid(cookieHeader: string | undefined, secret: string): boolean {
  return verifyAdminSession(readCookie(cookieHeader, ADMIN_SESSION_COOKIE), secret);
}
