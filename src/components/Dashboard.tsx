'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
  DOMAIN_LABEL,
  DOMAIN_ORDER,
  EXAM_MINUTES,
  PASS_PERCENT,
  type Catalog,
  type Domain,
  type Mode,
  type SessionStart,
  type SetInfo,
} from '@/lib/types';
import { clearActive, loadActive, loadHistory, loadWrong, saveActive, type Active, type Attempt } from '@/lib/storage';
import { IconArrowR, IconBolt, IconClock, IconRefresh, IconShuffle, IconTrophy } from './Icons';

const DOMAIN_COLOR: Record<Domain, string> = {
  secure: 'bg-orange-500',
  resilient: 'bg-amber-400',
  performance: 'bg-orange-300',
  cost: 'bg-stone-400',
  other: 'bg-stone-300',
};

function DomainBar({ domains, count }: { domains: Record<Domain, number>; count: number }) {
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-stone-100" title="Phân bổ theo domain">
      {DOMAIN_ORDER.map((d) =>
        domains[d] ? <div key={d} className={DOMAIN_COLOR[d]} style={{ width: `${(domains[d] / count) * 100}%` }} /> : null,
      )}
    </div>
  );
}

export function Dashboard() {
  const router = useRouter();
  const [cat, setCat] = useState<Catalog | null>(null);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState<Mode>('practice');
  const [tab, setTab] = useState<string>('');
  const [busy, setBusy] = useState('');
  const [history, setHistory] = useState<Attempt[]>([]);
  const [wrongCount, setWrongCount] = useState(0);
  const [active, setActive] = useState<Active | null>(null);
  const [shuffleSet, setShuffleSet] = useState(false);

  // tùy chọn đề trộn
  const [mixCount, setMixCount] = useState(30);
  const [mixDomains, setMixDomains] = useState<Domain[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
    setWrongCount(Object.keys(loadWrong()).length);
    setActive(loadActive());
    api<Catalog>('/api/catalog')
      .then((c) => {
        setCat(c);
        setTab((t) => t || c.sources[0]?.id || 'mix');
      })
      .catch((e) => setErr(e.message));
  }, []);

  const start = useCallback(
    async (key: string, body: Record<string, unknown>) => {
      setBusy(key);
      setErr('');
      try {
        const s = await api<SessionStart>('/api/session', { mode, ...body });
        saveActive({
          v: 1,
          token: s.token,
          mode: s.mode,
          title: s.title,
          durationSec: s.durationSec,
          startedAt: s.startedAt,
          questions: s.questions,
          answers: {},
          flags: [],
          checked: {},
          idx: 0,
        });
        router.push('/session');
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Không tạo được phiên làm bài');
        setBusy('');
      }
    },
    [mode, router],
  );

  const best = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of history) if (a.mode === 'exam') m.set(a.title, Math.max(m.get(a.title) ?? 0, a.percent));
    return m;
  }, [history]);

  const stats = useMemo(() => {
    const exams = history.filter((a) => a.mode === 'exam');
    const avg = exams.length ? exams.reduce((a, b) => a + b.percent, 0) / exams.length : 0;
    const questions = history.reduce((a, b) => a + b.answered, 0);
    const passed = exams.filter((e) => e.passed).length;
    return { exams: exams.length, avg, questions, passed };
  }, [history]);

  const setCard = (s: SetInfo, srcName: string) => {
    const key = s.id;
    const b = best.get(`${srcName} · ${s.title}`);
    return (
      <div key={s.id} className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-pop">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-bold tracking-tight text-stone-900">{s.title}</p>
            <p className="mt-0.5 text-xs text-stone-500">{s.count} câu hỏi đã lọc{mode === 'exam' && ` · ${Math.ceil(EXAM_MINUTES * s.count / 65)} phút`}</p>
          </div>
          {b !== undefined && (
            <span className={`chip ${b >= PASS_PERCENT ? '!border-green-200 !bg-green-50 !text-green-700' : ''}`}>
              <IconTrophy width={13} height={13} /> {b}%
            </span>
          )}
        </div>
        <div className="mt-4">
          <DomainBar domains={s.domains} count={s.count} />
        </div>
        <button
          className="btn-primary mt-5 w-full"
          disabled={!!busy}
          onClick={() => start(key, { setId: s.id, shuffle: shuffleSet })}
        >
          {busy === key ? 'Đang tạo đề…' : mode === 'exam' ? 'Bắt đầu thi' : 'Bắt đầu luyện'}
          <IconArrowR width={16} height={16} />
        </button>
      </div>
    );
  };

  const tabs = [...(cat?.sources.map((s) => ({ id: s.id, name: s.name })) ?? []), { id: 'mix', name: 'Đề trộn' }];
  const src = cat?.sources.find((s) => s.id === tab);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
      {/* HERO */}
      <section className="rise grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="chip !border-orange-200 !bg-orange-50 !text-orange-700">
            <IconBolt width={13} height={13} /> SAA-C03 · {cat ? cat.totalQuestions : '…'} câu hỏi
          </p>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-stone-900 sm:text-4xl">
            Sẵn sàng cho kỳ thi <span className="text-orange-500">Solutions Architect</span>?
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-stone-600">
            Đạt từ <b className="text-stone-900">{PASS_PERCENT}%</b> là đỗ. Luyện tập để hiểu sâu từng câu, rồi thi thử{' '}
            <b className="text-stone-900">{EXAM_MINUTES} phút</b> để làm quen áp lực phòng thi.
          </p>
        </div>
        <div className="card grid grid-cols-3 divide-x divide-stone-100 p-1">
          {[
            ['Lần thi thử', String(stats.exams)],
            ['Điểm TB', stats.exams ? `${Math.round(stats.avg)}%` : '—'],
            ['Câu đã làm', String(stats.questions)],
          ].map(([l, v]) => (
            <div key={l} className="px-4 py-5 text-center">
              <p className="text-2xl font-extrabold tracking-tight text-stone-900">{v}</p>
              <p className="mt-1 text-xs font-medium text-stone-500">{l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* RESUME */}
      {active && (
        <section className="rise mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-50/70 p-4 pl-5" style={{ animationDelay: '60ms' }}>
          <div>
            <p className="text-sm font-bold text-orange-900">{active.pausedAt !== undefined ? 'Bài thi đang tạm dừng' : 'Bạn có một phiên đang làm dở'}</p>
            <p className="text-xs text-orange-800/80">
              {active.mode === 'exam' ? 'Thi thử' : 'Luyện tập'} · {active.title} · đã trả lời {Object.keys(active.answers).length}/{active.questions.length} câu
              {active.pausedAt !== undefined && ' · Đồng hồ đã dừng'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="btn-ghost !min-h-9"
              onClick={() => {
                if (confirm('Bỏ phiên đang làm dở?')) {
                  clearActive();
                  setActive(null);
                }
              }}
            >
              Bỏ
            </button>
            <button className="btn-primary !min-h-9" onClick={() => router.push('/session')}>
              Tiếp tục <IconArrowR width={15} height={15} />
            </button>
          </div>
        </section>
      )}

      {/* MODE */}
      <section className="mt-10">
        <h2 className="label">1 · Chọn chế độ</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(
            [
              ['practice', 'Luyện tập', 'Hiện đáp án và giải thích chi tiết ngay sau khi bạn trả lời từng câu.', IconBolt],
              ['exam', 'Thi thử', `Đếm ngược ${EXAM_MINUTES} phút, không xem đáp án. Nộp bài để chấm điểm (đạt ≥ ${PASS_PERCENT}%).`, IconClock],
            ] as const
          ).map(([id, name, desc, Ic]) => {
            const on = mode === id;
            return (
              <button
                key={id}
                onClick={() => setMode(id)}
                aria-pressed={on}
                className={`card flex items-start gap-4 p-5 text-left transition ${
                  on ? '!border-orange-400 ring-4 ring-orange-100' : 'hover:border-orange-200'
                }`}
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-orange-500 text-white' : 'bg-stone-100 text-stone-500'}`}>
                  <Ic />
                </span>
                <span>
                  <span className="block text-base font-bold tracking-tight">{name}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-stone-600">{desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* SETS */}
      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="label">2 · Chọn bộ đề</h2>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" checked={shuffleSet} onChange={(e) => setShuffleSet(e.target.checked)} className="h-4 w-4 accent-orange-500" />
            Xáo trộn thứ tự câu hỏi
          </label>
        </div>

        <div role="tablist" className="mt-3 flex gap-1 overflow-x-auto rounded-2xl bg-stone-100 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition ${
                tab === t.id ? 'bg-white text-orange-700 shadow-sm' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>

        {err && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {err}
          </p>
        )}

        {!cat && !err && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card h-36 animate-pulse bg-stone-50" />
            ))}
          </div>
        )}

        {src && (
          <div className="rise mt-4">
            <p className="mb-3 text-sm text-stone-500">{src.desc}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{src.sets.map((s) => setCard(s, src.name))}</div>
          </div>
        )}

        {tab === 'mix' && cat && (
          <div className="rise mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="card p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                  <IconShuffle />
                </span>
                <div>
                  <p className="font-bold tracking-tight">Đề trộn ngẫu nhiên</p>
                  <p className="text-xs text-stone-500">Rút câu hỏi từ toàn bộ kho đề</p>
                </div>
              </div>
              <div className="mt-6">
                <p className="label">Số câu</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[10, 20, 30, 65, 100].map((n) => (
                    <button
                      key={n}
                      onClick={() => setMixCount(n)}
                      className={`h-10 min-w-14 rounded-xl border px-4 text-sm font-semibold transition ${
                        mixCount === n ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-stone-200 text-stone-600 hover:border-orange-200'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-5">
                <p className="label">Domain (bỏ trống = tất cả)</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DOMAIN_ORDER.filter((d) => d !== 'other').map((d) => {
                    const on = mixDomains.includes(d);
                    return (
                      <button
                        key={d}
                        onClick={() => setMixDomains((cur) => (on ? cur.filter((x) => x !== d) : [...cur, d]))}
                        aria-pressed={on}
                        className={`h-10 rounded-xl border px-3.5 text-sm font-semibold transition ${
                          on ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-stone-200 text-stone-600 hover:border-orange-200'
                        }`}
                      >
                        {DOMAIN_LABEL[d]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                className="btn-primary mt-7 h-11 w-full sm:w-auto sm:px-8"
                disabled={!!busy}
                onClick={() => start('mix', { mix: { count: mixCount, domains: mixDomains } })}
              >
                {busy === 'mix' ? 'Đang tạo đề…' : mode === 'exam' ? 'Bắt đầu thi' : 'Bắt đầu luyện'}
                <IconArrowR width={16} height={16} />
              </button>
            </div>

            <div className="card flex flex-col p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                  <IconRefresh />
                </span>
                <div>
                  <p className="font-bold tracking-tight">Ôn lại câu sai</p>
                  <p className="text-xs text-stone-500">{wrongCount} câu bạn từng làm sai</p>
                </div>
              </div>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-stone-600">
                Gom lại những câu bạn từng trả lời sai trong các lần trước. Làm đúng sẽ tự động được gỡ khỏi danh sách.
              </p>
              <button
                className="btn-soft mt-5 w-full"
                disabled={!!busy || wrongCount === 0}
                onClick={() => start('wrong', { ids: Object.keys(loadWrong()).slice(0, 130) })}
              >
                {busy === 'wrong' ? 'Đang tạo đề…' : 'Ôn lại ngay'}
              </button>
            </div>
          </div>
        )}
      </section>

      <footer className="mt-16 text-center text-xs text-stone-400">
        Tiến độ & lịch sử được lưu ngay trên trình duyệt này · Kho đề chỉ phục vụ qua API có kiểm soát
      </footer>
    </main>
  );
}
