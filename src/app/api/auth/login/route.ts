import { authCookie, fail, guard, matchCode, userTag } from '@/server/guard';
import { rateLimit } from '@/server/ratelimit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const g = await guard(req, { auth: false, perMin: 30 });
  if (g instanceof Response) return g;

  // Chống dò mật khẩu: 8 lần / 10 phút / IP
  const rl = await rateLimit('login', g.ip, 8, 600);
  if (!rl.ok) return fail(429, 'Sai quá nhiều lần. Thử lại sau ít phút.', { 'Retry-After': String(rl.retryAfter) });

  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === 'string' ? body.code.trim().slice(0, 200) : '';
  const matched = code ? matchCode(code) : null;
  if (!matched) {
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 300));
    return fail(401, 'Mã truy cập không đúng');
  }
  const res = Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  res.headers.append('Set-Cookie', authCookie(userTag(matched)));
  return res;
}
