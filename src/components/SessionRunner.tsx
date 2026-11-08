'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { elapsedMs, pauseClock, remainingSeconds, resumeClock } from '@/lib/session-clock';
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
import { SelectionHighlighter } from './SelectionHighlighter';
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
  const navDialog = useRef<HTMLDialogElement>(null);
  const answerClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const paused = !!act && act.pausedAt !== undefined;
  const remaining = act ? remainingSeconds(act, now) : 0;
  const elapsed = act ? Math.floor(elapsedMs(act, now) / 1000) : 0;

  useEffect(() => () => {
    if (answerClickTimer.current) clearTimeout(answerClickTimer.current);
  }, [q?.id]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeMobileNav = () => { if (desktop.matches) navDialog.current?.close(); };
    desktop.addEventListener('change', closeMobileNav);
    return () => desktop.removeEventListener('change', closeMobileNav);
  }, []);

  const pauseExam = useCallback(() => {
    if (!act || act.mode !== 'exam' || busy || submitting.current) return false;
    const at = Date.now();
    const next = pauseClock(act, at);
    if (next.pausedAt === undefined) return false;
    if (!saveActive(next)) { setErr('Không lưu được bài thi. Hãy kiểm tra bộ nhớ trình duyệt rồi thử lại.'); return false; }
    setNow(at);
    setAct(next);
    setConfirm(null);
    if (answerClickTimer.current) clearTimeout(answerClickTimer.current);
    window.getSelection()?.removeAllRanges();
    return true;
  }, [act, busy]);

  const resumeExam = useCallback(() => {
    if (!act || act.pausedAt === undefined) return;
    const at = Date.now();
    const next = resumeClock(act, at);
    if (!saveActive(next)) { setErr('Không lưu được bài thi. Hãy kiểm tra bộ nhớ trình duyệt rồi thử lại.'); return; }
    setNow(at);
    setAct(next);
    setErr('');
  }, [act]);

  const goto = useCallback(
    (i: number) => {
      if (paused) return;
      patch((a) => ({ ...a, idx: Math.min(a.questions.length - 1, Math.max(0, i)) }));
      if (answerClickTimer.current) clearTimeout(answerClickTimer.current);
      navDialog.current?.close();
      window.getSelection()?.removeAllRanges();
      topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
    [patch, paused],
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
      if (!act || !q || paused || window.getSelection()?.toString().trim()) return;
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
    [act, q, isExam, patch, check, paused],
  );

  const toggleFlag = useCallback(() => {
    if (!q || paused) return;
    patch((a) => ({ ...a, flags: a.flags.includes(q.id) ? a.flags.filter((x) => x !== q.id) : [...a.flags, q.id] }));
  }, [q, patch, paused]);

  /* ------------------------------ Thi thử: nộp bài ------------------------------ */
  const submitExam = useCallback(async () => {
    if (!act || act.pausedAt !== undefined || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setErr('');
    try {
      const r = await api<SubmitResult>('/api/submit', { token: act.token, answers: act.answers });
      const usedSec = Math.min(act.durationSec, Math.floor(elapsedMs(act, Date.now()) / 1000));
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
    if (isExam && act && !paused && act.durationSec > 0 && remaining === 0 && !submitting.current) void submitExam();
  }, [isExam, act, paused, remaining, submitExam]);

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
        usedSec: Math.floor(elapsedMs(act, Date.now()) / 1000),
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
    if (!act || !q || confirm || summary || paused) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName) || t.isContentEditable)) return;
      if (window.getSelection()?.toString().trim()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'arrowright') goto(act.idx + 1);
      else if (key === 'arrowleft') goto(act.idx - 1);
      else if (key === 'f' && !e.shiftKey) toggleFlag();
      else if (key === 'enter' && !isExam && q.choose > 1) void check(q.id, act.answers[q.id] ?? []);
      else {
        const opt = q.options.find((o) => o.k.toLowerCase() === key) ?? q.options[Number(key) - 1];
        if (opt) pick(opt.k);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act, q, confirm, summary, isExam, goto, toggleFlag, check, pick, paused]);

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

  if (paused) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-lg place-items-center px-4 py-10">
        <section className="card w-full p-6 text-center sm:p-8" aria-labelledby="paused-heading">
          <IconClock className="mx-auto text-orange-500" width={36} height={36} />
          <h1 id="paused-heading" className="mt-4 text-2xl font-bold">Bài thi đang tạm dừng</h1>
          <p className="mt-2 text-sm text-stone-600">{act.title}</p>
          <p className="mt-5 text-4xl font-bold tabular-nums text-orange-600" role="timer" aria-label="Thời gian còn lại">{fmt(remaining)}</p>
          <p className="mt-3 text-sm text-stone-600">Đồng hồ đã dừng. Câu trả lời, đánh dấu và phần tô sáng được giữ lại, kể cả khi tải lại trang hoặc đóng trình duyệt.</p>
          <p className="mt-3 text-xs text-stone-500">Câu {act.idx + 1}/{total} · Đã trả lời {stats.answered}/{total}</p>
          {err && <p role="alert" className="mt-3 text-sm text-red-700">{err}</p>}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button className="btn-primary" onClick={resumeExam}>Tiếp tục bài thi</button>
            <Link href="/" className="btn-ghost">Về trang chủ</Link>
          </div>
        </section>
      </main>
    );
  }

  const questionNavigation = (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">Danh sách câu hỏi</h2>
        <span className="text-xs text-stone-500">{stats.answered}/{total}</span>
      </div>
      <nav aria-label="Chuyển câu hỏi" className="grid max-h-[60dvh] grid-cols-5 gap-2 overflow-y-auto overscroll-contain p-1">
        {act.questions.map((question, index) => {
          const answered = (act.answers[question.id] ?? []).length > 0;
          const result = isExam ? undefined : act.checked[question.id];
          const marked = act.flags.includes(question.id);
          const current = index === act.idx;
          const status = result ? (result.ok ? 'đúng' : 'sai') : answered ? 'đã chọn đáp án' : 'chưa làm';
          const color = result
            ? result.ok ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-800'
            : answered ? 'border-orange-300 bg-orange-100 text-orange-900' : 'border-stone-200 bg-white text-stone-600';
          return <button key={question.id} onClick={() => goto(index)}
            aria-label={`Câu ${index + 1}, ${status}${marked ? ', đã đánh dấu' : ''}`} aria-current={current ? 'step' : undefined}
            className={`relative flex h-10 items-center justify-center rounded-lg border text-sm font-semibold transition hover:border-orange-400 focus-visible:outline-2 focus-visible:outline-orange-500 ${color} ${current ? 'ring-2 ring-orange-500 ring-offset-1' : ''}`}>
            {index + 1}
            {marked && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-orange-500" />}
          </button>;
        })}
      </nav>
      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2 text-[11px] text-stone-500">
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border border-stone-300 bg-white" />Chưa làm</span>
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-orange-200" />Đã chọn</span>
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-orange-500" />Đánh dấu</span>
        {!isExam && <>
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-green-200" />Đúng</span>
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-red-200" />Sai</span>
        </>}
      </div>
    </section>
  );

  const highlights = act.highlights?.[q.id] ?? [];

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

          {isExam && <button className="btn-ghost !min-h-10 !px-3" onClick={pauseExam} disabled={busy}>Tạm dừng</button>}
          <button
            onClick={() => (isExam ? setConfirm('submit') : setConfirm('quit'))}
            className="btn-primary !min-h-10 hidden sm:inline-flex"
          >
            {isExam ? 'Nộp bài' : 'Kết thúc'}
          </button>
        </div>
        {isExam && act.durationSec > 0 && (
          <div className="h-1 w-full bg-stone-100">
            <div className={`h-full transition-all ${low ? 'bg-red-500' : 'bg-orange-500'}`} style={{ width: `${(remaining / act.durationSec) * 100}%` }} />
          </div>
        )}
      </header>

      <div ref={topRef} className="scroll-mt-20" />
      <div className="mx-auto grid max-w-6xl items-start gap-6 px-4 pb-28 pt-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <main className="min-w-0">
          <button className="btn-ghost mb-4 w-full lg:hidden" onClick={() => navDialog.current?.showModal()} aria-haspopup="dialog">
            <IconGrid width={16} height={16} /> Danh sách câu hỏi
          </button>
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

            <SelectionHighlighter key={q.id}
              onAdd={(text) => {
                if (answerClickTimer.current) clearTimeout(answerClickTimer.current);
                patch((a) => ({ ...a, highlights: { ...a.highlights, [q.id]: [...new Set([...(a.highlights?.[q.id] ?? []), text])] } }));
              }}
              onRemove={(terms) => patch((a) => ({ ...a, highlights: { ...a.highlights, [q.id]: (a.highlights?.[q.id] ?? []).filter((text) => !terms.includes(text)) } }))}>
            <Markdown highlights={highlights} className="mt-5 !text-[16px] !leading-[1.75]">{q.text}</Markdown>

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
                    onClick={(event) => {
                      if (answerClickTimer.current) clearTimeout(answerClickTimer.current);
                      if (window.getSelection()?.toString().trim()) return;
                      if (event.detail > 1) return;
                      if (event.detail > 0 && (event.target as HTMLElement).closest('.md')) {
                        answerClickTimer.current = setTimeout(() => pick(o.k), 350);
                      } else pick(o.k);
                    }}
                    aria-disabled={!!res}
                    role={q.choose > 1 ? 'checkbox' : 'radio'}
                    aria-checked={on}
                    className={`flex w-full items-start gap-4 rounded-xl border p-4 text-left transition disabled:cursor-default ${cls}`}
                  >
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold ${badge}`}>
                      {res && isRight ? <IconCheck width={15} height={15} strokeWidth={3} /> : isWrong ? <IconX width={15} height={15} strokeWidth={3} /> : o.k}
                    </span>
                    <Markdown highlights={highlights} className="min-w-0 flex-1 !text-[15px]">{o.t}</Markdown>
                  </button>
                );
              })}
            </div>

            </SelectionHighlighter>

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
          <form className="mt-4 flex flex-wrap items-center justify-center gap-2" onSubmit={(e) => {
            e.preventDefault();
            const number = Number(new FormData(e.currentTarget).get('questionNumber'));
            if (Number.isInteger(number) && number >= 1 && number <= total) goto(number - 1);
          }}>
            <label htmlFor="question-number" className="text-xs text-stone-500">Đi tới câu</label>
            <input id="question-number" name="questionNumber" type="number" inputMode="numeric" min={1} max={total} required
              className="h-10 w-24 rounded-xl border border-stone-200 px-3 text-sm focus:outline-orange-500" aria-label="Số câu muốn chuyển tới" />
            <button type="submit" className="btn-ghost">Đi tới</button>
            <span className="text-xs text-stone-500">Đã trả lời {stats.answered}/{total}</span>
          </form>
          <p className="mt-4 hidden text-center text-xs text-stone-400 lg:block">
            Phím tắt: A–E chọn đáp án · ← → chuyển câu · F đánh dấu{!isExam && ' · Enter kiểm tra (câu nhiều đáp án)'}
          </p>
        </main>
        <aside className="sticky top-24 hidden lg:block" aria-label="Danh sách câu hỏi">{questionNavigation}</aside>
      </div>

      <dialog ref={navDialog} aria-label="Danh sách câu hỏi" onKeyDown={(event) => event.stopPropagation()}
        className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-80 max-w-[90vw] border-0 bg-white p-4 shadow-xl backdrop:bg-stone-900/40 open:flex open:flex-col lg:hidden"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) navDialog.current?.close();
        }}>
        <div className="mb-4 flex justify-end">
          <button className="btn-ghost !px-3" onClick={() => navDialog.current?.close()} aria-label="Đóng danh sách câu hỏi"><IconX width={18} height={18} /></button>
        </div>
        <div className="min-h-0 overflow-y-auto">{questionNavigation}</div>
      </dialog>

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
                    ? 'Tạm dừng để lưu tiến độ và dừng đồng hồ. Bạn có thể quay lại tiếp tục bài thi từ trang chủ.'
                    : `Bạn đã kiểm tra ${stats.checked}/${total} câu${stats.checked ? ` (đúng ${stats.correct})` : ''}. Kết quả sẽ được lưu vào lịch sử.`}
                </p>
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <button className="btn-ghost" onClick={() => setConfirm(null)}>Làm tiếp</button>
                  {isExam ? (
                    <button className="btn-primary" disabled={busy} onClick={() => { if (pauseExam()) router.push('/'); }}>Tạm dừng & về trang chủ</button>
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
