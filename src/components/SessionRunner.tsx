'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
  DOMAIN_LABEL,
  PASS_PERCENT,
  type CheckResult,
  type Domain,
  type SubmitResult,
} from '@/lib/types';
import {
  clearActive,
  loadActive,
  newId,
  saveActive,
  saveAttempt,
  updateWrong,
  type Active,
  type Attempt,
} from '@/lib/storage';
import { Markdown } from './Markdown';
import { ExplanationPanel } from './ExplanationPanel';
import { Logo } from './AppHeader';
import { IconArrowL, IconArrowR, IconCheck, IconClock, IconFlag, IconGrid, IconX } from './Icons';

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h > 0 ? h + ':' : ''}${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function SessionRunner() {
  const router = useRouter();
  const [act, setAct] = useState<Active | null>(null);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState<null | 'submit' | 'quit'>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [summary, setSummary] = useState<null | { correct: number; checked: number; total: number; byDomain: Record<string, { total: number; correct: number }> }>(null);
  const submitting = useRef(false);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const a = loadActive();
    if (!a) router.replace('/');
    setAct(a);
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (act) saveActive(act);
  }, [act]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const patch = useCallback((fn: (a: Active) => Active) => setAct((a) => (a ? fn(a) : a)), []);

  const q = act?.questions[act.idx];
  const isExam = act?.mode === 'exam';
  const endAt = act && act.durationSec ? act.startedAt + act.durationSec * 1000 : 0;
  const remaining = endAt ? Math.max(0, Math.ceil((endAt - now) / 1000)) : 0;
  const elapsed = act ? Math.max(0, Math.floor((now - act.startedAt) / 1000)) : 0;

  const goto = useCallback(
    (i: number) => {
      patch((a) => ({ ...a, idx: Math.min(a.questions.length - 1, Math.max(0, i)) }));
      setNavOpen(false);
      topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
    [patch],
  );

  /* ------------------------------ Luyện tập: kiểm tra ------------------------------ */
  const check = useCallback(
    async (qid: string, sel: string[]) => {
      if (!act || act.checked[qid] || !sel.length) return;
      setErr('');
      setBusy(true);
      try {
        const r = await api<CheckResult>('/api/check', { token: act.token, id: qid, sel });
        patch((a) => ({ ...a, checked: { ...a.checked, [qid]: r } }));
        updateWrong([{ id: qid, ok: r.ok }]);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Không kiểm tra được đáp án');
      } finally {
        setBusy(false);
      }
    },
    [act, patch],
  );

  const pick = useCallback(
    (k: string) => {
      if (!act || !q) return;
      if (act.checked[q.id]) return; // đã khóa sau khi xem đáp án
      const cur = act.answers[q.id] ?? [];
      let next: string[];
      if (q.choose === 1) next = [k];
      else if (cur.includes(k)) next = cur.filter((x) => x !== k);
      else if (cur.length >= q.choose) return;
      else next = [...cur, k];
      patch((a) => ({ ...a, answers: { ...a.answers, [q.id]: next } }));
      if (!isExam && q.choose === 1) void check(q.id, next);
    },
    [act, q, isExam, patch, check],
  );

  const toggleFlag = useCallback(() => {
    if (!q) return;
    patch((a) => ({ ...a, flags: a.flags.includes(q.id) ? a.flags.filter((x) => x !== q.id) : [...a.flags, q.id] }));
  }, [q, patch]);

  /* ------------------------------ Thi thử: nộp bài ------------------------------ */
  const submitExam = useCallback(async () => {
    if (!act || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setErr('');
    try {
      const r = await api<SubmitResult>('/api/submit', { token: act.token, answers: act.answers });
      const usedSec = Math.min(act.durationSec, Math.floor((Date.now() - act.startedAt) / 1000));
      const attempt: Attempt = {
        id: newId(),
        at: Date.now(),
        mode: 'exam',
        title: act.title,
        total: r.total,
        correct: r.correctCount,
        answered: r.answered,
        percent: r.percent,
        passed: r.passed,
        usedSec,
        byDomain: r.byDomain,
        hasReview: true,
      };
      saveAttempt(attempt, { questions: act.questions, result: r, answers: act.answers, flags: act.flags, attempt });
      updateWrong(r.items.map((i) => ({ id: i.id, ok: i.ok })));
      clearActive();
      router.replace(`/result?id=${attempt.id}`);
    } catch (e) {
      submitting.current = false;
      setBusy(false);
      setErr(e instanceof Error ? e.message : 'Nộp bài không thành công');
      setConfirm('submit');
    }
  }, [act, router]);

  // tự nộp khi hết giờ
  useEffect(() => {
    if (isExam && act && endAt && remaining === 0 && !submitting.current) void submitExam();
  }, [isExam, act, endAt, remaining, submitExam]);

  /* ------------------------------ Luyện tập: kết thúc ------------------------------ */
  const finishPractice = useCallback(() => {
    if (!act) return;
    const byDomain: Record<string, { total: number; correct: number }> = {};
    let correct = 0;
    let checked = 0;
    for (const qq of act.questions) {
      const r = act.checked[qq.id];
      if (!r) continue;
      checked++;
      if (r.ok) correct++;
      const d = (byDomain[qq.domain ?? 'other'] ??= { total: 0, correct: 0 });
      d.total++;
      if (r.ok) d.correct++;
    }
    if (checked > 0) {
      saveAttempt({
        id: newId(),
        at: Date.now(),
        mode: 'practice',
        title: act.title,
        total: act.questions.length,
        correct,
        answered: checked,
        percent: Math.round((correct / checked) * 1000) / 10,
        passed: correct / checked >= PASS_PERCENT / 100,
        usedSec: Math.floor((Date.now() - act.startedAt) / 1000),
        byDomain,
        hasReview: false,
      });
    }
    clearActive();
    setConfirm(null);
    setSummary({ correct, checked, total: act.questions.length, byDomain });
  }, [act]);

  /* ------------------------------ Phím tắt ------------------------------ */
  useEffect(() => {
    if (!act || !q || confirm || summary) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'arrowright') goto(act.idx + 1);
      else if (key === 'arrowleft') goto(act.idx - 1);
      else if (key === 'f') toggleFlag();
      else if (key === 'enter' && !isExam && q.choose > 1) void check(q.id, act.answers[q.id] ?? []);
      else {
        const opt = q.options.find((o) => o.k.toLowerCase() === key) ?? q.options[Number(key) - 1];
        if (opt) pick(opt.k);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act, q, confirm, summary, isExam, goto, toggleFlag, check, pick]);

  const stats = useMemo(() => {
    if (!act) return { answered: 0, flagged: 0, checked: 0, correct: 0 };
    const checked = Object.values(act.checked);
    return {
      answered: act.questions.filter((x) => (act.answers[x.id] ?? []).length > 0).length,
      flagged: act.flags.length,
      checked: checked.length,
      correct: checked.filter((c) => c.ok).length,
    };
  }, [act]);

  if (!ready || !act || !q) {
    return <div className="grid min-h-dvh place-items-center text-sm text-stone-500">Đang tải phiên làm bài…</div>;
  }

  const total = act.questions.length;
  const sel = act.answers[q.id] ?? [];
  const res = act.checked[q.id];
  const flagged = act.flags.includes(q.id);
  const low = isExam && remaining <= 600;
  const unanswered = total - stats.answered;

  const navBtn = (i: number) => {
    const qq = act.questions[i];
    const answered = (act.answers[qq.id] ?? []).length > 0;
    const r = act.checked[qq.id];
    const cur = i === act.idx;
    let cls = 'border-stone-200 bg-white text-stone-600 hover:border-orange-300';
    if (r) cls = r.ok ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-800';
    else if (answered) cls = 'border-orange-300 bg-orange-100 text-orange-900';
    return (
      <button
        key={qq.id}
        onClick={() => goto(i)}
        aria-label={`Câu ${i + 1}${answered ? ', đã trả lời' : ''}${act.flags.includes(qq.id) ? ', đã đánh dấu' : ''}`}
        aria-current={cur}
        className={`relative flex h-9 items-center justify-center rounded-lg border text-[13px] font-semibold transition ${cls} ${
          cur ? 'ring-2 ring-orange-500 ring-offset-1' : ''
        }`}
      >
        {i + 1}
        {act.flags.includes(qq.id) && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-orange-500" />}
      </button>
    );
  };

  const navPanel = (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="label">Danh sách câu hỏi</p>
        <p className="text-xs font-medium text-stone-500">
          {stats.answered}/{total}
        </p>
      </div>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-5">{act.questions.map((_, i) => navBtn(i))}</div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-stone-500">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm border border-orange-300 bg-orange-100" />Đã chọn</span>
        {!isExam && <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm border border-green-300 bg-green-50" />Đúng</span>}
        {!isExam && <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm border border-red-300 bg-red-50" />Sai</span>}
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-orange-500" />Đánh dấu</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh">
      {/* Thanh trên cùng */}
      <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <button onClick={() => setConfirm('quit')} className="shrink-0" aria-label="Thoát phiên làm bài">
            <Logo size={34} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold tracking-tight">{act.title}</p>
            <p className="text-xs text-stone-500">
              {isExam ? 'Thi thử' : 'Luyện tập'} · Câu {act.idx + 1}/{total}
              {!isExam && stats.checked > 0 && ` · Đúng ${stats.correct}/${stats.checked}`}
            </p>
          </div>

          <div
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 font-mono text-sm font-bold tabular-nums ${
              low ? 'animate-pulse border-red-300 bg-red-50 text-red-700' : 'border-orange-200 bg-orange-50 text-orange-800'
            }`}
            aria-label={isExam ? 'Thời gian còn lại' : 'Thời gian đã làm'}
            role="timer"
          >
            <IconClock width={16} height={16} />
            {isExam ? fmt(remaining) : fmt(elapsed)}
          </div>

          <button onClick={() => setNavOpen((v) => !v)} className="btn-ghost !min-h-10 !px-3 lg:hidden" aria-label="Danh sách câu hỏi" aria-expanded={navOpen}>
            <IconGrid width={18} height={18} />
          </button>
          <button
            onClick={() => (isExam ? setConfirm('submit') : setConfirm('quit'))}
            className="btn-primary !min-h-10 hidden sm:inline-flex"
          >
            {isExam ? 'Nộp bài' : 'Kết thúc'}
          </button>
        </div>
        {isExam && endAt > 0 && (
          <div className="h-1 w-full bg-stone-100">
            <div className={`h-full transition-all ${low ? 'bg-red-500' : 'bg-orange-500'}`} style={{ width: `${(remaining / act.durationSec) * 100}%` }} />
          </div>
        )}
      </header>

      <div ref={topRef} className="scroll-mt-20" />
      <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-28 pt-6 sm:px-6 lg:grid-cols-[1fr_300px]">
        {navOpen && <div className="lg:hidden">{navPanel}</div>}

        <main>
          <article className="card rise p-5 sm:p-8" key={q.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-orange-500 px-2.5 py-1 text-xs font-bold text-white">Câu {act.idx + 1}</span>
              <span className="chip">{q.choose > 1 ? `Chọn ${q.choose} đáp án` : 'Chọn 1 đáp án'}</span>
              {q.domain && <span className="chip">{DOMAIN_LABEL[q.domain as Domain]}</span>}
              <button
                onClick={toggleFlag}
                className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                  flagged ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-stone-200 text-stone-500 hover:border-orange-200 hover:text-orange-700'
                }`}
                aria-pressed={flagged}
              >
                <IconFlag width={14} height={14} /> {flagged ? 'Đã đánh dấu' : 'Đánh dấu'}
              </button>
            </div>

            <Markdown className="mt-5 !text-[16px] !leading-[1.75]">{q.text}</Markdown>

            <div className="mt-6 space-y-3" role={q.choose > 1 ? 'group' : 'radiogroup'} aria-label="Các phương án">
              {q.options.map((o) => {
                const on = sel.includes(o.k);
                const isRight = !!res && res.correct.includes(o.k);
                const isWrong = !!res && on && !isRight;
                let cls = 'border-stone-200 bg-white hover:border-orange-300 hover:bg-orange-50/40';
                let badge = 'bg-stone-100 text-stone-600';
                if (res) {
                  if (isRight) {
                    cls = 'border-green-400 bg-green-50';
                    badge = 'bg-green-500 text-white';
                  } else if (isWrong) {
                    cls = 'border-red-400 bg-red-50';
                    badge = 'bg-red-500 text-white';
                  } else {
                    cls = 'border-stone-200 bg-white opacity-60';
                  }
                } else if (on) {
                  cls = 'border-orange-400 bg-orange-50 ring-2 ring-orange-100';
                  badge = 'bg-orange-500 text-white';
                }
                return (
                  <button
                    key={o.k}
                    onClick={() => pick(o.k)}
                    disabled={!!res}
                    role={q.choose > 1 ? 'checkbox' : 'radio'}
                    aria-checked={on}
                    className={`flex w-full items-start gap-4 rounded-xl border p-4 text-left transition disabled:cursor-default ${cls}`}
                  >
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold ${badge}`}>
                      {res && isRight ? <IconCheck width={15} height={15} strokeWidth={3} /> : isWrong ? <IconX width={15} height={15} strokeWidth={3} /> : o.k}
                    </span>
                    <Markdown className="min-w-0 flex-1 !text-[15px]">{o.t}</Markdown>
                  </button>
                );
              })}
            </div>

            {!isExam && !res && q.choose > 1 && (
              <div className="mt-5 flex items-center gap-3">
                <button className="btn-primary" disabled={busy || sel.length !== q.choose} onClick={() => check(q.id, sel)}>
                  {busy ? 'Đang kiểm tra…' : 'Kiểm tra đáp án'}
                </button>
                <span className="text-xs text-stone-500">
                  Đã chọn {sel.length}/{q.choose}
                </span>
              </div>
            )}
            {isExam && q.choose > 1 && (
              <p className="mt-4 text-xs text-stone-500">
                Đã chọn {sel.length}/{q.choose} đáp án
              </p>
            )}
            {err && (
              <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {err}
              </p>
            )}

            {res && <ExplanationPanel expl={res.expl} ok={res.ok} />}
          </article>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button className="btn-ghost" onClick={() => goto(act.idx - 1)} disabled={act.idx === 0}>
              <IconArrowL width={16} height={16} /> Câu trước
            </button>
            {act.idx === total - 1 ? (
              <button className="btn-primary" onClick={() => (isExam ? setConfirm('submit') : setConfirm('quit'))}>
                {isExam ? 'Nộp bài' : 'Kết thúc'}
              </button>
            ) : (
              <button className="btn-primary" onClick={() => goto(act.idx + 1)}>
                Câu tiếp <IconArrowR width={16} height={16} />
              </button>
            )}
          </div>
          <p className="mt-4 hidden text-center text-xs text-stone-400 lg:block">
            Phím tắt: A–F chọn đáp án · ← → chuyển câu · F đánh dấu{!isExam && ' · Enter kiểm tra (câu nhiều đáp án)'}
          </p>
        </main>

        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4">
            {navPanel}
            <button className="btn-primary w-full" onClick={() => (isExam ? setConfirm('submit') : setConfirm('quit'))}>
              {isExam ? 'Nộp bài' : 'Kết thúc luyện tập'}
            </button>
          </div>
        </aside>
      </div>

      {/* Nút nổi trên mobile */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 p-3 backdrop-blur sm:hidden">
        <button className="btn-primary w-full" onClick={() => (isExam ? setConfirm('submit') : setConfirm('quit'))}>
          {isExam ? 'Nộp bài' : 'Kết thúc'}
        </button>
      </div>

      {/* Hộp thoại xác nhận */}
      {confirm && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-stone-900/40 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true">
          <div className="card rise w-full max-w-md p-6">
            {confirm === 'submit' ? (
              <>
                <h2 className="text-lg font-bold tracking-tight">Nộp bài thi?</h2>
                <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                  {[
                    ['Đã trả lời', stats.answered],
                    ['Chưa làm', unanswered],
                    ['Đánh dấu', stats.flagged],
                  ].map(([l, v]) => (
                    <div key={l} className="rounded-xl bg-stone-50 py-3">
                      <dd className={`text-2xl font-extrabold ${l === 'Chưa làm' && unanswered > 0 ? 'text-orange-600' : ''}`}>{v}</dd>
                      <dt className="text-xs text-stone-500">{l}</dt>
                    </div>
                  ))}
                </dl>
                {unanswered > 0 && <p className="mt-3 text-sm text-orange-700">Còn {unanswered} câu chưa trả lời — các câu này sẽ tính là sai.</p>}
                {err && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{err}</p>}
                <div className="mt-6 flex justify-end gap-2">
                  <button className="btn-ghost" onClick={() => { setConfirm(null); setErr(''); }} disabled={busy}>Làm tiếp</button>
                  <button className="btn-primary" onClick={submitExam} disabled={busy}>{busy ? 'Đang chấm…' : 'Nộp bài'}</button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold tracking-tight">{isExam ? 'Thoát khỏi bài thi?' : 'Kết thúc luyện tập?'}</h2>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">
                  {isExam
                    ? 'Bài thi đang được lưu, bạn có thể quay lại làm tiếp — đồng hồ vẫn tiếp tục chạy.'
                    : `Bạn đã kiểm tra ${stats.checked}/${total} câu${stats.checked ? ` (đúng ${stats.correct})` : ''}. Kết quả sẽ được lưu vào lịch sử.`}
                </p>
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <button className="btn-ghost" onClick={() => setConfirm(null)}>Làm tiếp</button>
                  {isExam ? (
                    <Link href="/" className="btn-primary">Về trang chủ</Link>
                  ) : (
                    <button className="btn-primary" onClick={finishPractice}>Kết thúc & lưu</button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tổng kết luyện tập */}
      {summary && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true">
          <div className="card rise w-full max-w-md p-7 text-center">
            <p className="label">Tổng kết luyện tập</p>
            <p className="mt-3 text-5xl font-extrabold tracking-tight text-orange-500">
              {summary.checked ? Math.round((summary.correct / summary.checked) * 100) : 0}%
            </p>
            <p className="mt-1 text-sm text-stone-600">
              Đúng {summary.correct}/{summary.checked} câu đã kiểm tra · tổng {summary.total} câu
            </p>
            <div className="mt-5 space-y-2 text-left">
              {Object.entries(summary.byDomain).map(([d, v]) => (
                <div key={d}>
                  <div className="flex justify-between text-xs font-medium text-stone-600">
                    <span>{DOMAIN_LABEL[d as Domain] ?? d}</span>
                    <span>{v.correct}/{v.total}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-stone-100">
                    <div className="h-full rounded-full bg-orange-500" style={{ width: `${(v.correct / v.total) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-7 flex justify-center gap-2">
              <Link href="/history" className="btn-ghost">Xem lịch sử</Link>
              <Link href="/" className="btn-primary">Về trang chủ</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
