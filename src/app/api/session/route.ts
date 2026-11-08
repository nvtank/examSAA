import { getBank, type Domain, type Q } from '@/server/bank';
import { sign } from '@/server/crypto';
import { fail, guard, json } from '@/server/guard';
import { rateLimit } from '@/server/ratelimit';
import { shuffle, toDTO, type SessPayload } from '@/server/session';
import { EXAM_MINUTES, type SessionStart } from '@/lib/types';

export const dynamic = 'force-dynamic';

const DOMAINS = new Set<string>(['secure', 'resilient', 'performance', 'cost', 'other']);

type Body = {
  mode?: unknown;
  setId?: unknown;
  mix?: { count?: unknown; domains?: unknown; sources?: unknown };
  ids?: unknown;
  shuffle?: unknown;
};

export async function POST(req: Request) {
  const g = await guard(req);
  if (g instanceof Response) return g;

  const rl = await rateLimit('sess', g.user, 40, 3600);
  if (!rl.ok) return fail(429, 'Tạo quá nhiều phiên làm bài. Hãy thử lại sau.', { 'Retry-After': String(rl.retryAfter) });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return fail(400, 'bad request');
  const mode = body.mode === 'exam' ? 'exam' : body.mode === 'practice' ? 'practice' : null;
  if (!mode) return fail(400, 'bad mode');

  const bank = getBank();
  let list: Q[] = [];
  let title = '';

  if (typeof body.setId === 'string') {
    const set = bank.sets.find((s) => s.id === body.setId);
    const qs = bank.bySet.get(body.setId);
    if (!set || !qs) return fail(404, 'Không tìm thấy bộ đề');
    list = [...qs].sort((a, b) => a.n - b.n);
    const src = bank.sources.find((s) => s.id === set.source);
    title = `${src?.name ?? ''} · ${set.title}`;
    if (body.shuffle === true) list = shuffle(list);
  } else if (Array.isArray(body.ids)) {
    const ids = body.ids.filter((x): x is string => typeof x === 'string').slice(0, 130);
    list = ids.map((id) => bank.byId.get(id)).filter((q): q is Q => !!q);
    title = 'Ôn lại câu sai';
    if (body.shuffle !== false) list = shuffle(list);
  } else if (body.mix && typeof body.mix === 'object') {
    const count = Math.min(130, Math.max(5, Math.floor(Number(body.mix.count) || 20)));
    const domains = Array.isArray(body.mix.domains)
      ? new Set(body.mix.domains.filter((d): d is string => typeof d === 'string' && DOMAINS.has(d)))
      : new Set<string>();
    const sources = Array.isArray(body.mix.sources)
      ? new Set(body.mix.sources.filter((s): s is string => typeof s === 'string'))
      : new Set<string>();
    const okSets = new Set(bank.sets.filter((s) => !sources.size || sources.has(s.source)).map((s) => s.id));
    const pool: Q[] = [];
    for (const [sid, qs] of bank.bySet) {
      if (!okSets.has(sid)) continue;
      for (const q of qs) if (!domains.size || domains.has(q.domain as Domain)) pool.push(q);
    }
    list = shuffle(pool).slice(0, count);
    title = 'Đề trộn ngẫu nhiên';
  }

  if (list.length === 0) return fail(400, 'Không có câu hỏi phù hợp');

  const t0 = Date.now();
  // 160 phút cho 65 câu; đề ngắn hơn/dài hơn thì quy đổi theo tỉ lệ
  const dur = mode === 'exam' ? Math.ceil((EXAM_MINUTES * 60 * list.length) / 65) : 0;
  const payload: SessPayload = {
    u: g.user,
    m: mode,
    ids: list.map((q) => q.id),
    t0,
    dur,
    // Keep a saved exam resumable on another day, including long pauses.
    exp: t0 + 30 * 24 * 3600 * 1000,
  };
  const out: SessionStart = {
    token: sign('sess', payload),
    mode,
    title,
    durationSec: dur,
    startedAt: t0,
    questions: list.map((q) => toDTO(q, mode === 'practice')),
  };
  return json(out);
}
