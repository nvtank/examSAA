'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DOMAIN_LABEL, DOMAIN_ORDER, PASS_PERCENT, type Domain } from '@/lib/types';
import { loadHistory, type Attempt } from '@/lib/storage';
import { IconArrowR } from './Icons';

const fmtDate = (t: number) =>
  new Date(t).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function HistoryView() {
  const [hist, setHist] = useState<Attempt[] | null>(null);
  useEffect(() => setHist(loadHistory()), []);

  const agg = useMemo(() => {
    const d: Record<string, { total: number; correct: number }> = {};
    for (const a of hist ?? []) for (const [k, v] of Object.entries(a.byDomain)) {
      const x = (d[k] ??= { total: 0, correct: 0 });
      x.total += v.total;
      x.correct += v.correct;
    }
    return d;
  }, [hist]);

  const trend = useMemo(() => (hist ?? []).filter((a) => a.mode === 'exam').slice(0, 12).reverse(), [hist]);

  if (!hist) return <div className="p-10 text-center text-sm text-stone-500">Đang tải…</div>;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20 pt-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Lịch sử làm bài</h1>
      <p className="mt-1 text-sm text-stone-500">Lưu trên trình duyệt này · chi tiết lời giải được giữ cho 4 lần thi thử gần nhất</p>

      {hist.length === 0 ? (
        <div className="card mt-8 p-10 text-center">
          <p className="font-bold">Chưa có lượt làm bài nào</p>
          <p className="mt-1 text-sm text-stone-500">Hoàn thành một phiên luyện tập hoặc thi thử để xem thống kê tại đây.</p>
          <Link href="/" className="btn-primary mt-5">Bắt đầu ngay</Link>
        </div>
      ) : (
        <>
          <section className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="card p-5">
              <p className="label">Điểm các lần thi thử</p>
              {trend.length === 0 ? (
                <p className="mt-6 text-sm text-stone-500">Chưa có bài thi thử nào.</p>
              ) : (
                <div className="mt-4 flex h-32 items-end gap-2" role="img" aria-label="Biểu đồ điểm thi thử">
                  {trend.map((a) => (
                    <div key={a.id} className="group relative flex h-full flex-1 flex-col justify-end" title={`${a.percent}% · ${fmtDate(a.at)}`}>
                      <div className={`w-full rounded-t-md ${a.passed ? 'bg-green-500' : 'bg-orange-400'}`} style={{ height: `${Math.max(4, a.percent)}%` }} />
                    </div>
                  ))}
                </div>
              )}
              <div className="relative mt-1 border-t border-dashed border-orange-300 text-right text-[10px] font-semibold text-orange-600">ngưỡng {PASS_PERCENT}%</div>
            </div>
            <div className="card p-5">
              <p className="label">Độ chính xác theo domain</p>
              <div className="mt-4 space-y-3">
                {DOMAIN_ORDER.filter((d) => agg[d]).map((d) => {
                  const v = agg[d];
                  const p = Math.round((v.correct / v.total) * 100);
                  return (
                    <div key={d}>
                      <div className="flex justify-between text-xs font-semibold text-stone-700">
                        <span>{DOMAIN_LABEL[d as Domain]}</span>
                        <span>{p}% <span className="font-normal text-stone-400">({v.correct}/{v.total})</span></span>
                      </div>
                      <div className="mt-1.5 h-2 rounded-full bg-stone-100">
                        <div className={`h-full rounded-full ${p >= PASS_PERCENT ? 'bg-green-500' : 'bg-orange-500'}`} style={{ width: `${p}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="mt-6 space-y-3">
            {hist.map((a) => (
              <div key={a.id} className="card flex flex-wrap items-center gap-4 p-4 pl-5">
                <div className={`flex h-12 w-14 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold ${a.passed ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
                  {Math.round(a.percent)}%
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{a.title}</p>
                  <p className="text-xs text-stone-500">
                    {a.mode === 'exam' ? 'Thi thử' : 'Luyện tập'} · {a.correct}/{a.mode === 'exam' ? a.total : a.answered} đúng · {fmtDate(a.at)}
                  </p>
                </div>
                {a.mode === 'exam' && <span className={`chip ${a.passed ? '!border-green-200 !bg-green-50 !text-green-700' : ''}`}>{a.passed ? 'Đạt' : 'Chưa đạt'}</span>}
                {a.hasReview && (
                  <Link href={`/result?id=${a.id}`} className="btn-ghost !min-h-9">
                    Xem lại <IconArrowR width={14} height={14} />
                  </Link>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
