import { getBank } from '@/server/bank';
import { chargeReveal, fail, guard, json } from '@/server/guard';
import { cleanSel, readSession, sameSet, toExpl } from '@/server/session';
import type { CheckResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Chế độ luyện tập: chỉ lộ đáp án SAU KHI người dùng đã chọn, mỗi lần trừ 1 quota. */
export async function POST(req: Request) {
  const g = await guard(req);
  if (g instanceof Response) return g;

  const body = (await req.json().catch(() => null)) as { token?: unknown; id?: unknown; sel?: unknown } | null;
  const sess = readSession(body?.token, g.user);
  if (!sess || sess.m !== 'practice') return fail(400, 'Phiên không hợp lệ');
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!sess.ids.includes(id)) return fail(400, 'Câu hỏi không thuộc phiên này');
  const q = getBank().byId.get(id);
  if (!q) return fail(404, 'not found');
  const sel = cleanSel(q, body?.sel);
  if (sel.length === 0) return fail(400, 'Hãy chọn đáp án trước');

  const limited = await chargeReveal(g, 1);
  if (limited) return limited;

  const out: CheckResult = { correct: q.correct, ok: sameSet(sel, q.correct), expl: toExpl(q) };
  return json(out);
}
