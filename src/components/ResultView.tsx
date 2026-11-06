'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { DOMAIN_LABEL, DOMAIN_ORDER, PASS_PERCENT, type Domain, type SessionStart } from '@/lib/types';
import { loadResult, saveActive, type StoredResult } from '@/lib/storage';
import { Markdown } from './Markdown';
import { ExplanationPanel } from './ExplanationPanel';
import { IconCheck, IconFlag, IconRefresh, IconX } from './Icons';

const fmtDur = (s: number) => `${Math.floor(s / 60)} phút ${String(s % 60).padStart(2, '0')} giây`;

function Ring({ percent, passed }: { percent: number; passed: boolean }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 128 128" className="h-36 w-36 -rotate-90" aria-hidden>
      <circle cx="64" cy="64" r={r} fill="none" stroke="#f5f5f4" strokeWidth="12" />
      <circle
        cx="64"
        cy="64"
        r={r}
        fill="none"
        stroke={passed ? '#22c55e' : '#f97316'}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - percent / 100)}
        style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.2,.7,.2,1)' }}
      />
    </svg>
  );
}

function Inner() {
  const router = useRouter();
  const id = useSearchParams().get('id') ?? '';
  const [data, setData] = useState<StoredResult | null | undefined>(undefined);
  const [filter, setFilter] = useState<'all' | 'wrong' | 'flag' | 'skip'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => setData(loadResult(id)), [id]);

  const items = useMemo(() => {
    if (!data) return [];
    const qs = new Map(data.questions.map((q, i) => [q.id, { q, n: i + 1 }]));
    return data.result.items
      .map((it) => ({ it, ...qs.get(it.id)! }))
      .filter((x) => x.q)
      .filter(({ it }) => {
        if (filter === 'wrong') return !it.ok;
        if (filter === 'flag') return data.flags.includes(it.id);
        if (filter === 'skip') return it.selected.length === 0;
        return true;
      });
  }, [data, filter]);

  if (data === undefined) return <div className="p-10 text-center text-sm text-stone-500">Đang tải…</div>;
  if (!data) {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-lg font-bold">Không tìm thấy chi tiết bài thi</p>
        <p className="mt-2 text-sm text-stone-500">Chỉ 4 lần thi gần nhất được lưu đầy đủ lời giải trên trình duyệt này.</p>
        <Link href="/history" className="btn-primary mt-6">Về lịch sử</Link>
      </main>
    );
  }

  const { result: r, attempt } = data;
  const wrongIds = r.items.filter((i) => !i.ok).map((i) => i.id);

  async function retryWrong() {
    setBusy(true);
    setErr('');
    try {
      const s = await api<SessionStart>('/api/session', { mode: 'practice', ids: wrongIds });
      saveActive({ v: 1, token: s.token, mode: s.mode, title: s.title, durationSec: 0, startedAt: s.startedAt, questions: s.questions, answers: {}, flags: [], checked: {}, idx: 0 });
      router.push('/session');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Không tạo được phiên');
      setBusy(false);
    }
  }

  const tabs = [
    ['all', `Tất cả (${r.items.length})`],
    ['wrong', `Sai (${r.items.filter((i) => !i.ok).length})`],
    ['flag', `Đánh dấu (${data.flags.length})`],
    ['skip', `Chưa làm (${r.items.filter((i) => !i.selected.length).length})`],
  ] as const;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20 pt-8 sm:px-6">
      <section className="card rise overflow-hidden">
        <div className={`px-6 py-3 text-center text-sm font-bold tracking-wide text-white ${r.passed ? 'bg-green-500' : 'bg-orange-500'}`}>
          {r.passed ? 'ĐẠT — bạn đã vượt ngưỡng 72%' : `CHƯA ĐẠT — cần tối thiểu ${PASS_PERCENT}%`}
        </div>
        <div className="grid items-center gap-8 p-7 sm:grid-cols-[auto_1fr] sm:p-9">
          <div className="relative mx-auto">
            <Ring percent={r.percent} passed={r.passed} />
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="text-3xl font-extrabold tracking-tight">{r.percent}%</p>
                <p className="text-xs font-medium text-stone-500">≈ {r.scaled}/1000</p>
              </div>
            </div>
          </div>
          <div>
            <p className="label">{attempt.title}</p>
            <p className="mt-1 text-2xl font-extrabold tracking-tight">
              {r.correctCount}/{r.total} câu đúng
            </p>
            <p className="mt-1 text-sm text-stone-600">
              Đã trả lời {r.answered}/{r.total} · Thời gian làm bài {fmtDur(attempt.usedSec)}
            </p>
            <div className="mt-5 space-y-3">
              {DOMAIN_ORDER.filter((d) => r.byDomain[d]).map((d) => {
                const v = r.byDomain[d];
                const p = Math.round((v.correct / v.total) * 100);
                return (
                  <div key={d}>
                    <div className="flex justify-between text-xs font-semibold text-stone-700">
                      <span>{DOMAIN_LABEL[d as Domain]}</span>
                      <span>{v.correct}/{v.total} · {p}%</span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-stone-100">
                      <div className={`h-full rounded-full ${p >= PASS_PERCENT ? 'bg-green-500' : 'bg-orange-500'}`} style={{ width: `${p}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-stone-100 bg-stone-50/60 px-6 py-4">
          <Link href="/" className="btn-primary">Làm đề khác</Link>
          <button className="btn-soft" disabled={busy || wrongIds.length === 0} onClick={retryWrong}>
            <IconRefresh width={16} height={16} /> Ôn lại {wrongIds.length} câu sai
          </button>
          <Link href="/history" className="btn-ghost">Lịch sử</Link>
          {err && <span className="self-center text-sm font-medium text-red-600">{err}</span>}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold tracking-tight">Xem lại bài làm</h2>
        <div className="mt-3 flex gap-1 overflow-x-auto rounded-2xl bg-stone-100 p-1">
          {tabs.map(([k, l]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition ${filter === k ? 'bg-white text-orange-700 shadow-sm' : 'text-stone-600'}`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {items.length === 0 && <p className="card p-6 text-center text-sm text-stone-500">Không có câu nào trong mục này.</p>}
          {items.map(({ it, q, n }) => {
            const expanded = open === it.id;
            return (
              <div key={it.id} className="card overflow-hidden">
                <button className="flex w-full items-start gap-3 p-4 text-left" onClick={() => setOpen(expanded ? null : it.id)} aria-expanded={expanded}>
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white ${it.ok ? 'bg-green-500' : it.selected.length ? 'bg-red-500' : 'bg-stone-400'}`}>
                    {it.ok ? <IconCheck width={15} height={15} strokeWidth={3} /> : <IconX width={15} height={15} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-xs font-semibold text-stone-500">
                      Câu {n} · {DOMAIN_LABEL[it.domain]}
                      {data.flags.includes(it.id) && <IconFlag width={13} height={13} className="text-orange-500" />}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-sm font-medium text-stone-800">{q.text.replace(/[`*#>]/g, '')}</span>
                  </span>
                  <span className="text-stone-400">{expanded ? '▴' : '▾'}</span>
                </button>
                {expanded && (
                  <div className="border-t border-stone-100 p-5">
                    <Markdown>{q.text}</Markdown>
                    <div className="mt-4 space-y-2">
                      {q.options.map((o) => {
                        const right = it.correct.includes(o.k);
                        const mine = it.selected.includes(o.k);
                        const cls = right ? 'border-green-400 bg-green-50' : mine ? 'border-red-400 bg-red-50' : 'border-stone-200 opacity-70';
                        return (
                          <div key={o.k} className={`flex items-start gap-3 rounded-xl border p-3 ${cls}`}>
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${right ? 'bg-green-500 text-white' : mine ? 'bg-red-500 text-white' : 'bg-stone-100 text-stone-600'}`}>{o.k}</span>
                            <div className="min-w-0 flex-1">
                              <Markdown className="!text-sm">{o.t}</Markdown>
                              {(right || mine) && (
                                <p className={`mt-1 text-xs font-semibold ${right ? 'text-green-700' : 'text-red-700'}`}>
                                  {right ? 'Đáp án đúng' : 'Bạn đã chọn'}{right && mine ? ' · bạn đã chọn' : ''}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <ExplanationPanel expl={it.expl} ok={it.ok} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

export function ResultView() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-sm text-stone-500">Đang tải…</div>}>
      <Inner />
    </Suspense>
  );
}
