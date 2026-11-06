// Kiểu dữ liệu dùng chung giữa API và giao diện (KHÔNG chứa đáp án).
export type Domain = 'secure' | 'resilient' | 'performance' | 'cost' | 'other';
export type Mode = 'practice' | 'exam';

export const DOMAIN_LABEL: Record<Domain, string> = {
  secure: 'Thiết kế bảo mật',
  resilient: 'Thiết kế chịu lỗi',
  performance: 'Hiệu năng cao',
  cost: 'Tối ưu chi phí',
  other: 'Khác',
};
export const DOMAIN_SHORT: Record<Domain, string> = {
  secure: 'Secure',
  resilient: 'Resilient',
  performance: 'High-Performing',
  cost: 'Cost-Optimized',
  other: 'Other',
};
export const DOMAIN_ORDER: Domain[] = ['secure', 'resilient', 'performance', 'cost', 'other'];

export type SetInfo = {
  id: string;
  source: string;
  title: string;
  count: number;
  domains: Record<Domain, number>;
};
export type SourceInfo = { id: string; name: string; desc: string; sets: SetInfo[] };
export type Catalog = { sources: SourceInfo[]; totalQuestions: number };

export type QuestionDTO = {
  id: string;
  choose: number; // số đáp án cần chọn
  text: string; // markdown
  options: { k: string; t: string }[];
  domain?: Domain; // chỉ có ở chế độ luyện tập
};

export type Explanation = {
  topic: string;
  why: string;
  distractors: string;
  tips: string;
  refs: string;
};

export type CheckResult = { correct: string[]; ok: boolean; expl: Explanation };

export type SessionStart = {
  token: string;
  mode: Mode;
  title: string;
  durationSec: number; // 0 = không giới hạn
  startedAt: number;
  questions: QuestionDTO[];
};

export type ReviewItem = {
  id: string;
  selected: string[];
  correct: string[];
  ok: boolean;
  domain: Domain;
  expl: Explanation;
};

export type SubmitResult = {
  total: number;
  correctCount: number;
  answered: number;
  percent: number;
  scaled: number;
  passed: boolean;
  byDomain: Record<string, { total: number; correct: number }>;
  items: ReviewItem[];
};

export const PASS_PERCENT = 72;
export const EXAM_MINUTES = 160;
