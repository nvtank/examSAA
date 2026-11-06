import { clearCookie, guard } from '@/server/guard';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const g = await guard(req, { auth: false });
  if (g instanceof Response) return g;
  const res = Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  res.headers.append('Set-Cookie', clearCookie());
  return res;
}
