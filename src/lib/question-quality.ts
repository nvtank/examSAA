// Shared by the offline importer and the server. Never infer an answer from prose.
export type BankQuestion = {
  n: number;
  topic: string;
  domain: string;
  choose: number;
  text: string;
  options: { k: string; t: string }[];
  correct: string[];
  expl: { why: string; distractors: string; tips: string; refs: string };
};
export type QuestionSet<T extends BankQuestion = BankQuestion> = {
  id: string;
  source: string;
  title: string;
  questions: T[];
};

const answerLabel = /(?:đáp\s*án(?:\s*đúng)?|câu\s*trả\s*lời\s*đúng|(?:correct|right)\s*answers?|answer(?:\s*key)?|correct\s*options?)\s*[*_`]*\s*[:：]\s*/iu;
const sectionLabel = /^(?:giải\s*thích(?:\s*chi\s*tiết)?|explanations?|phân\s*tích\s*(?:đáp\s*án|bẫy)|mẹo\s*(?:ghi\s*nhớ|làm\s*bài)|references?)\s*(?:[:：]|$)/iu;
const answerMarker = /`?\[(?:Đáp\s*án(?:\s*đúng)?|Correct\s*answers?|Lựa chọn của bạn|Your (?:answer|selection))[^\]\n]*\]`?/giu;
const plainLine = (s: string) => s.replace(/^[\s#>*_`\-\p{Extended_Pictographic}\uFE0F]+/u, '').replace(/[*_`]/g, '').trim();

/** Remove explicit answer metadata and review sections, retaining the question itself. */
export function cleanQuestionText(md: string): string {
  const lines = md.replace(answerMarker, '').replace(/\r\n?/g, '\n').split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const plain = plainLine(line);
    if (/^<details\b/iu.test(plain) || sectionLabel.test(plain)) break;
    if (answerLabel.test(plain)) {
      // An inline label ends the visible text; a standalone metadata line can be skipped.
      const match = answerLabel.exec(line);
      const prefix = match ? line.slice(0, match.index).replace(/[\s#>*_`\-✅✔☑]+$/u, '').trim() : '';
      if (prefix && /[\p{L}\p{N}]/u.test(prefix)) kept.push(prefix);
      continue;
    }
    if (/^\s*(?:<\/?(?:summary|details)>.*|---+)\s*$/iu.test(line)) continue;
    kept.push(line);
  }
  return kept.join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

export function cleanOptionText(md: string): string {
  return cleanQuestionText(md)
    .replace(/\s*(?:[✅✔☑]|\((?:correct(?: answer)?|đúng)\)|\[(?:correct(?: answer)?|đúng)\])\s*/giu, ' ')
    .replace(/^\s*\[[ xX]\]\s*/u, '')
    .trim();
}

export const normalizedText = (s: string) => s.normalize('NFKC').toLocaleLowerCase('vi')
  .replace(/[*_`#>]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function cleanQuestion<T extends BankQuestion>(q: T): T {
  return { ...q, text: cleanQuestionText(q.text), options: q.options.map((o) => ({ ...o, t: cleanOptionText(o.t) })) };
}

export function questionIssues(q: BankQuestion): string[] {
  const issues: string[] = [];
  if (q.text.length < 40) issues.push('thiếu đề bài đầy đủ');
  if (q.options.length < 4 || q.options.length > 8) issues.push('thiếu hoặc thừa phương án');
  if (new Set(q.options.map((o) => o.k)).size !== q.options.length) issues.push('trùng nhãn phương án');
  if (q.options.some((o) => normalizedText(o.t).length < 2)) issues.push('phương án rỗng');
  if (new Set(q.options.map((o) => normalizedText(o.t))).size !== q.options.length) issues.push('trùng nội dung phương án');
  if (!q.correct.length || q.correct.length >= q.options.length || new Set(q.correct).size !== q.correct.length || q.choose !== q.correct.length) issues.push('số đáp án không hợp lệ');
  if (q.correct.some((k) => !q.options.some((o) => o.k === k))) issues.push('đáp án không có phương án tương ứng');
  if (q.expl.why.trim().length < 20) issues.push('thiếu giải thích đầy đủ');
  if ([q.text, ...q.options.map((o) => o.t)].some((s) => answerLabel.test(s) || /(?:\[(?:đáp\s*án|correct\s*answer)|\b(?:option|answer)\s+[A-H]\s+is\s+(?:the\s+)?correct\b|\bcorrect\s*[:：]\s*[A-H]\b|[✅✔☑])/iu.test(s))) issues.push('còn dấu hiệu lộ đáp án');
  const count = q.text.match(/(?:choose|select|chọn)\s*(?:any\s+)?(?:\(?\s*)(two|three|four|hai|ba|bốn|[2-4])\b/iu)?.[1]?.toLowerCase();
  const expected = count ? ({ two: 2, hai: 2, three: 3, ba: 3, four: 4, bốn: 4 }[count] ?? Number(count)) : 0;
  if (expected && expected !== q.choose) issues.push('số lựa chọn trong đề không khớp đáp án');
  return issues;
}

export type QualityReport = {
  sets: { id: string; title: string; total: number; repaired: number[]; rejected: { n: number; reasons: string[] }[] }[];
  duplicates: { kept: string; removed: string }[];
  conflicts: string[][];
  total: number;
  retained: number;
};

/** Deduplicate by stem + unordered options; quarantine conflicting answer keys. */
export function curateSets<T extends BankQuestion>(sets: QuestionSet<T>[]) {
  const report: QualityReport = { sets: [], duplicates: [], conflicts: [], total: 0, retained: 0 };
  const groups = new Map<string, { q: T; ref: string; answer: string }[]>();
  const cleaned: QuestionSet<T>[] = [];
  for (const set of sets) {
    const entry: QualityReport['sets'][number] = { id: set.id, title: set.title, total: set.questions.length, repaired: [], rejected: [] };
    const questions: T[] = [];
    for (const original of set.questions) {
      report.total++;
      const q = cleanQuestion(original);
      if (q.text !== original.text || q.options.some((o, i) => o.t !== original.options[i].t)) entry.repaired.push(q.n);
      const reasons = questionIssues(q);
      if (reasons.length) { entry.rejected.push({ n: q.n, reasons }); continue; }
      questions.push(q);
      const key = normalizedText(q.text) + '\u0000' + q.options.map((o) => normalizedText(o.t)).sort().join('\u0000');
      const answer = q.options.filter((o) => q.correct.includes(o.k)).map((o) => normalizedText(o.t)).sort().join('\u0000');
      const group = groups.get(key) ?? [];
      group.push({ q, ref: `${set.id}#${q.n}`, answer });
      groups.set(key, group);
    }
    cleaned.push({ ...set, questions });
    report.sets.push(entry);
  }
  const questions: T[] = [];
  const conflicts = new Set<T>();
  for (const group of groups.values()) {
    if (new Set(group.map((item) => item.answer)).size > 1) {
      report.conflicts.push(group.map((item) => item.ref));
      for (const item of group) conflicts.add(item.q);
      continue;
    }
    // Prefer the copy with the most complete explanation.
    group.sort((a, b) => b.q.expl.why.length - a.q.expl.why.length);
    questions.push(group[0].q);
    for (const item of group.slice(1)) report.duplicates.push({ kept: group[0].ref, removed: item.ref });
  }
  report.retained = questions.length;
  return { questions, cleaned: cleaned.map((s) => ({ ...s, questions: s.questions.filter((q) => !conflicts.has(q)) })), report };
}
