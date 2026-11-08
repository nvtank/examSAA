import 'server-only';
import crypto from 'node:crypto';
import type { Q } from './bank';
import { verify } from './crypto';
import type { Explanation, QuestionDTO } from '@/lib/types';
import { cleanOptionText, cleanQuestionText } from '@/lib/question-quality';

export type SessPayload = {
  u: string;
  m: 'practice' | 'exam';
  ids: string[];
  t0: number;
  dur: number; // giây
  exp: number;
};

export const readSession = (token: unknown, user: string): SessPayload | null => {
  if (typeof token !== 'string') return null;
  const p = verify<SessPayload>('sess', token);
  return p && p.u === user ? p : null;
};

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** DTO gửi cho client: KHÔNG có đáp án / giải thích. */
export function toDTO(q: Q, withDomain: boolean): QuestionDTO {
  return {
    id: q.id,
    choose: q.choose,
    text: cleanQuestionText(q.text),
    options: q.options.map((o) => ({ k: o.k, t: cleanOptionText(o.t) })),
    ...(withDomain ? { domain: q.domain } : {}),
  };
}

export const toExpl = (q: Q): Explanation => ({
  topic: q.topic,
  why: q.expl.why,
  distractors: q.expl.distractors,
  tips: q.expl.tips,
  refs: q.expl.refs,
});

export function cleanSel(q: Q, sel: unknown): string[] {
  if (!Array.isArray(sel)) return [];
  const valid = new Set(q.options.map((o) => o.k));
  return [...new Set(sel.filter((x): x is string => typeof x === 'string' && valid.has(x)))].sort();
}

export const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
