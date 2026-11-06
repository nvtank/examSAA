import 'server-only';
import { NextResponse } from 'next/server';
import { sha256hex, safeEqual, sign, verify } from './crypto';
import { rateLimit } from './ratelimit';

export const AUTH_COOKIE = 'cep_s';
const AUTH_TTL_MS = 7 * 24 * 3600 * 1000;

export function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}
export const fail = (status: number, error: string, headers?: Record<string, string>) => json({ error }, status, headers);

export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get('x-real-ip') ||
    h.get('x-vercel-forwarded-for')?.split(',')[0].trim() ||
    h.get('x-forwarded-for')?.split(',')[0].trim() ||
    'local'
  );
}

/** Các client tự động phổ biến. Chỉ là hàng rào đầu tiên — lớp bảo vệ thật là đăng nhập + quota. */
const BOT_UA =
  /(curl|wget|python|requests|aiohttp|httpx|scrapy|urllib|go-http|okhttp|java\/|apache-http|libwww|perl|ruby|php|node-fetch|undici|axios|got\/|postman|insomnia|httpie|headless|phantom|selenium|puppeteer|playwright|crawler|spider|bot\b|scraper|harvest)/i;

function readCookie(req: Request, name: string): string | undefined {
  const c = req.headers.get('cookie');
  if (!c) return undefined;
  for (const part of c.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export type Ctx = { ip: string; user: string };

type Opts = { auth?: boolean; perMin?: number };

/** Kiểm tra mọi request vào API. Trả về Response (từ chối) hoặc ngữ cảnh hợp lệ. */
export async function guard(req: Request, opts: Opts = {}): Promise<Response | Ctx> {
  const ua = req.headers.get('user-agent') || '';
  if (!ua || ua.length < 12 || BOT_UA.test(ua)) return fail(403, 'forbidden');

  if (req.method !== 'GET') {
    // Chặn CSRF / gọi chéo site; API chỉ nhận request từ chính trang web này
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');
    let okOrigin = false;
    try {
      okOrigin = !!origin && !!host && new URL(origin).host === host;
    } catch {
      okOrigin = false;
    }
    const sfs = req.headers.get('sec-fetch-site');
    if (!okOrigin || (sfs && sfs !== 'same-origin')) return fail(403, 'forbidden');
  }
  if (req.headers.get('x-cep') !== '1') return fail(403, 'forbidden');

  const ip = clientIp(req);
  const g = await rateLimit('ip', ip, opts.perMin ?? 90, 60);
  if (!g.ok) return fail(429, 'Quá nhiều yêu cầu. Thử lại sau ít phút.', { 'Retry-After': String(g.retryAfter) });

  let user = 'anon';
  if (opts.auth !== false) {
    const p = verify<{ u: string; exp: number }>('auth', readCookie(req, AUTH_COOKIE));
    if (!p) return fail(401, 'unauthorized');
    user = p.u;
  }
  return { ip, user };
}

export function accessCodes(): string[] {
  return (process.env.ACCESS_CODES || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
}

export function matchCode(input: string): string | null {
  let found: string | null = null;
  for (const code of accessCodes()) if (safeEqual(code, input)) found = code; // không break: thời gian đều nhau
  return found;
}

export const userTag = (code: string) => sha256hex(`user:${code}`).slice(0, 12);

export function authCookie(user: string): string {
  const token = sign('auth', { u: user, exp: Date.now() + AUTH_TTL_MS });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${AUTH_TTL_MS / 1000}${secure}`;
}
export function clearCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

/** Dùng trong Server Component để chuyển hướng người chưa đăng nhập. */
export function isAuthed(cookieValue: string | undefined): boolean {
  return !!verify('auth', cookieValue);
}

export const limits = () => ({
  perMin: Number(process.env.REVEAL_LIMIT_PER_MIN) || 30,
  perDay: Number(process.env.REVEAL_LIMIT_PER_DAY) || 700,
});

/** Trừ quota "xem đáp án" theo người dùng + IP. */
export async function chargeReveal(ctx: Ctx, cost: number, bulk = false): Promise<Response | null> {
  const L = limits();
  const [a, b, c] = await Promise.all([
    // lẻ (practice): tối đa N câu/phút; trọn bài (exam): tối đa 6 lần nộp / 10 phút
    bulk ? rateLimit('rv-bulk', ctx.user, 6, 600, 1) : rateLimit('rv-min', ctx.user, L.perMin, 60, 1),
    rateLimit('rv-day', ctx.user, L.perDay, 86400, cost),
    rateLimit('rv-day-ip', ctx.ip, L.perDay, 86400, cost),
  ]);
  const bad = [a, b, c].find((r) => !r.ok);
  if (bad) {
    return fail(429, 'Đã chạm hạn mức xem đáp án. Hãy nghỉ một lát rồi tiếp tục.', {
      'Retry-After': String(bad.retryAfter),
    });
  }
  return null;
}
