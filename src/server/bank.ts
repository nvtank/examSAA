import 'server-only';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import blob from './data/bank.enc.json';
import { curateSets } from '@/lib/question-quality';

export type Domain = 'secure' | 'resilient' | 'performance' | 'cost' | 'other';
export type Expl = { why: string; distractors: string; tips: string; refs: string };
export type Q = {
  id: string; // id mờ (HMAC) — không lộ thứ tự/nguồn
  setId: string;
  n: number;
  topic: string;
  domain: Domain;
  choose: number;
  text: string;
  options: { k: string; t: string }[];
  correct: string[];
  expl: Expl;
};
export type SetMeta = { id: string; source: string; title: string; count: number; domains: Record<Domain, number> };
export type SourceMeta = { id: string; name: string; desc: string };
export type Bank = { sources: SourceMeta[]; sets: SetMeta[]; byId: Map<string, Q>; bySet: Map<string, Q[]> };

let cache: Bank | null = null;

function dataKey(): Buffer {
  const k = process.env.DATA_KEY;
  if (!k) throw new Error('Thiếu DATA_KEY — không thể giải mã kho đề');
  const buf = Buffer.from(k, 'base64');
  if (buf.length !== 32) throw new Error('DATA_KEY phải là 32 byte (base64)');
  return buf;
}

export function getBank(): Bank {
  if (cache) return cache;
  const key = dataKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'));
  decipher.setAAD(Buffer.from('cep-bank-v1'));
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
  const gz = Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()]);
  const raw = JSON.parse(zlib.gunzipSync(gz).toString('utf8')) as {
    sources: SourceMeta[];
    sets: { source: string; id: string; title: string; questions: Omit<Q, 'id' | 'setId'>[] }[];
  };

  const prepared = raw.sets.map((s) => ({
    ...s,
    questions: s.questions.map((q) => ({
      ...q,
      setId: s.id,
      id: crypto.createHmac('sha256', key).update(`${s.id}:${q.n}`).digest('base64url').slice(0, 12),
    })),
  }));
  const curated = curateSets(prepared);
  if (!curated.questions.length) throw new Error('Kho đề chưa có câu hỏi đạt kiểm tra chất lượng');
  const byId = new Map<string, Q>();
  const bySet = new Map<string, Q[]>();
  const sets: SetMeta[] = [];
  // Retain valid original IDs so saved sessions can still be checked.
  for (const s of curated.cleaned) for (const q of s.questions) byId.set(q.id, q);
  const source = { id: 'curated', name: 'Bộ đề tổng hợp', desc: 'Gom từ các nguồn hiện có, lọc câu thiếu nội dung, gỡ dấu đáp án và loại câu trùng hoặc mâu thuẫn đáp án.' };
  const merged = { id: 'saa-complete', source: source.id, title: 'SAA-C03 · Bộ đề đã lọc' };
  for (const s of [merged]) {
    const qs = curated.questions.map((q, i) => ({ ...q, n: i + 1 }));
    const domains: Record<Domain, number> = { secure: 0, resilient: 0, performance: 0, cost: 0, other: 0 };
    for (const q of qs) {
      byId.set(q.id, q);
      domains[q.domain]++;
    }
    bySet.set(s.id, qs);
    sets.push({ id: s.id, source: s.source, title: s.title, count: qs.length, domains });
  }
  cache = { sources: [source], sets, byId, bySet };
  return cache;
}
