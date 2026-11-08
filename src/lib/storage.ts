// Lưu tiến độ cục bộ trên trình duyệt (localStorage). Mọi thao tác đều bọc try/catch.
import type { CheckResult, Domain, Mode, QuestionDTO, SubmitResult } from './types';
import { cleanOptionText, cleanQuestionText } from './question-quality';

const K = {
  active: 'cep:active',
  history: 'cep:history',
  wrong: 'cep:wrong',
  res: (id: string) => `cep:res:${id}`,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

export type Active = {
  v: 1;
  token: string;
  mode: Mode;
  title: string;
  durationSec: number;
  startedAt: number;
  questions: QuestionDTO[];
  answers: Record<string, string[]>;
  flags: string[];
  checked: Record<string, CheckResult>;
  idx: number;
  highlights?: Record<string, string[]>;
};

export const loadActive = () => {
  const a = read<Active | null>(K.active, null);
  return a && a.v === 1 ? {
    ...a,
    questions: a.questions.map((q) => ({ ...q, text: cleanQuestionText(q.text), options: q.options.map((o) => ({ ...o, t: cleanOptionText(o.t) })) })),
  } : null;
};
export const saveActive = (a: Active) => write(K.active, a);
export const clearActive = () => remove(K.active);

export type Attempt = {
  id: string;
  at: number;
  mode: Mode;
  title: string;
  total: number;
  correct: number;
  answered: number;
  percent: number;
  passed: boolean;
  usedSec: number;
  byDomain: Record<string, { total: number; correct: number }>;
  hasReview: boolean;
};

export const loadHistory = () => read<Attempt[]>(K.history, []);

export type StoredResult = {
  questions: QuestionDTO[];
  result: SubmitResult;
  answers: Record<string, string[]>;
  flags: string[];
  attempt: Attempt;
};

export function saveAttempt(attempt: Attempt, stored?: StoredResult) {
  const hist = [attempt, ...loadHistory()].slice(0, 300);
  if (stored) {
    // chỉ giữ chi tiết (đề + lời giải) của 4 lần gần nhất để không đầy bộ nhớ
    for (let i = 0; i < hist.length; i++) {
      if (i >= 4 && hist[i].hasReview) {
        remove(K.res(hist[i].id));
        hist[i] = { ...hist[i], hasReview: false };
      }
    }
    if (!write(K.res(attempt.id), stored)) {
      hist[0] = { ...hist[0], hasReview: false };
    }
  }
  write(K.history, hist);
}
export const loadResult = (id: string) => read<StoredResult | null>(K.res(id), null);

/** Danh sách câu từng làm sai (id -> thời điểm). Làm đúng lần sau sẽ được gỡ khỏi danh sách. */
export const loadWrong = () => read<Record<string, number>>(K.wrong, {});
export function updateWrong(results: { id: string; ok: boolean }[]) {
  const w = loadWrong();
  const now = Date.now();
  for (const r of results) {
    if (r.ok) delete w[r.id];
    else w[r.id] = now;
  }
  write(K.wrong, w);
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export type DomainStat = Record<Domain | string, { total: number; correct: number }>;
