import 'server-only';
import crypto from 'node:crypto';

const b64u = (b: Buffer) => b.toString('base64url');

function secret(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('Thiếu SESSION_SECRET');
  const buf = Buffer.from(s, 'base64');
  if (buf.length < 32) throw new Error('SESSION_SECRET phải ≥ 32 byte (base64)');
  return buf;
}

function mac(purpose: string, body: string): string {
  return b64u(crypto.createHmac('sha256', secret()).update(purpose).update('.').update(body).digest());
}

export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Token có chữ ký HMAC: `<payload>.<mac>`. `purpose` ngăn dùng nhầm token giữa các chức năng. */
export function sign(purpose: string, payload: object): string {
  const body = b64u(Buffer.from(JSON.stringify(payload)));
  return `${body}.${mac(purpose, body)}`;
}

export function verify<T extends { exp?: number }>(purpose: string, token: string | undefined | null): T | null {
  if (!token || token.length > 8192) return null;
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const body = token.slice(0, i);
  if (!safeEqual(mac(purpose, body), token.slice(i + 1))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
    if (p.exp && p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

export const sha256hex = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
