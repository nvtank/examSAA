import { getBank } from '@/server/bank';
import { chargeReveal, fail, guard, json } from '@/server/guard';
import { cleanSel, readSession, sameSet, toExpl } from '@/server/session';
import { PASS_PERCENT, type ReviewItem, type SubmitResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Chế độ thi thử: đáp án chỉ được trả về khi nộp bài (trừ quota theo số câu). */
export async function POST(req: Request) {
  const g = await guard(req, { perMin: 30 });
  if (g instanceof Response) return g;

  const body = (await req.json().catch(() => null)) as { token?: unknown; answers?: unknown } | null;
  const sess = readSession(body?.token, g.user);
  if (!sess || sess.m !== 'exam') return fail(400, 'Phiên không hợp lệ');
  const answers = body?.answers && typeof body.answers === 'object' ? (body.answers as Record<string, unknown>) : {};

  const limited = await chargeReveal(g, sess.ids.length, true);
  if (limited) return limited;

  const bank = getBank();
  const byDomain: SubmitResult['byDomain'] = {};
  const items: ReviewItem[] = [];
  let correctCount = 0;
  let answered = 0;
  for (const id of sess.ids) {
    const q = bank.byId.get(id);
    if (!q) continue;
    const selected = cleanSel(q, answers[id]);
    const ok = sameSet(selected, q.correct);
    if (selected.length) answered++;
    if (ok) correctCount++;
    const d = (byDomain[q.domain] ??= { total: 0, correct: 0 });
    d.total++;
    if (ok) d.correct++;
    items.push({ id, selected, correct: q.correct, ok, domain: q.domain, expl: toExpl(q) });
  }
  const total = items.length;
  const percent = total ? Math.round((correctCount / total) * 1000) / 10 : 0;
  const out: SubmitResult = {
    total,
    correctCount,
    answered,
    percent,
    scaled: Math.round(100 + 9 * percent), // quy đổi gần đúng sang thang 100–1000 của AWS
    passed: percent >= PASS_PERCENT,
    byDomain,
    items,
  };
  return json(out);
}
