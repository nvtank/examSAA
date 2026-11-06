// Parser: biến các file Markdown (Cloud Mentor / Dojo / Udemy) thành JSON chuẩn hóa.
// Chỉ chạy lúc build bank (local), KHÔNG được bundle vào ứng dụng.
import fs from 'node:fs';
import path from 'node:path';

const DOMAIN_MAP = [
  [/secure/i, 'secure'],
  [/resilient/i, 'resilient'],
  [/high[- ]?performing/i, 'performance'],
  [/cost/i, 'cost'],
];

export function normDomain(raw = '') {
  for (const [re, id] of DOMAIN_MAP) if (re.test(raw)) return id;
  return 'other';
}

function clean(md) {
  return md
    .replace(/^﻿/, '')
    .replace(/\r\n/g, '\n')
    // ảnh tham chiếu file local không tồn tại trong repo
    .replace(/^\s*!\[[^\]]*\]\([^)]*\)\s*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const stripMarker = (s) =>
  s.replace(/\s*`\[Lựa chọn của bạn[^`]*`\s*$/u, '').trim();

/** Tách các block "## ... / ### ..." theo regex mở đầu. */
function splitBlocks(text, re) {
  const idx = [];
  const g = new RegExp(re.source, 'gm');
  let m;
  while ((m = g.exec(text))) idx.push({ i: m.index, m });
  return idx.map((x, k) => ({
    head: x.m,
    body: text.slice(x.i, k + 1 < idx.length ? idx[k + 1].i : text.length),
  }));
}

function between(body, startRe, endRes) {
  const s = body.search(startRe);
  if (s < 0) return '';
  const after = body.slice(s).replace(startRe, '');
  let end = after.length;
  for (const re of endRes) {
    const e = after.search(re);
    if (e >= 0 && e < end) end = e;
  }
  return after.slice(0, end);
}

function parseRefs(md) {
  const t = md.trim();
  if (!t || /Không có liên kết bổ sung/i.test(t)) return '';
  return t;
}

/* ------------------------- Cloud Mentor & Udemy ------------------------- */
export function parseMentorStyle(file) {
  const text = clean(fs.readFileSync(file, 'utf8'));
  const blocks = splitBlocks(text, /^### Question (\d+): (.+)$/);
  const out = [];
  for (const { head, body } of blocks) {
    const n = Number(head[1]);
    const topic = head[2].trim();
    const domainRaw = (body.match(/\*\*Miền kiến thức \(Domain\)\*\*:\s*(.+?)\s*$/m) || [])[1] || '';

    const textMd = between(body, /^#### 📋.*$/m, [/^#### 🔘/m]).trim();
    const optsMd = between(body, /^#### 🔘.*$/m, [/^<details>/m, /^#### ✅/m]);
    const options = [];
    for (const line of optsMd.split('\n')) {
      const m = line.match(/^- \*\*\(([A-H])\)\*\*\s*(.*)$/);
      if (m) options.push({ k: m[1], t: stripMarker(m[2]) });
      else if (options.length && line.trim() && !line.startsWith('<')) {
        options[options.length - 1].t += '\n' + stripMarker(line.trim());
      }
    }
    const ansLine = (body.match(/^#### ✅ Đáp án đúng:\s*(.+)$/m) || [])[1] || '';
    const correct = [...ansLine.matchAll(/\(([A-H])\)/g)].map((m) => m[1]);

    const endAll = [/^<\/details>/m, /^---\s*$/m];
    const why = between(body, /^#### 💡.*$/m, [/^#### ❌/m, /^#### 🔑/m, /^#### 📚/m, ...endAll]).trim();
    const distractors = between(body, /^#### ❌.*$/m, [/^#### 🔑/m, /^#### 📚/m, ...endAll])
      .replace(/Không có phân tích bẫy bổ sung\.?/gi, '')
      .trim();
    const tips = between(body, /^#### 🔑.*$/m, [/^#### 📚/m, ...endAll]).trim();
    const refs = parseRefs(between(body, /^#### 📚.*$/m, endAll));

    out.push({
      n,
      topic,
      domain: normDomain(domainRaw),
      // một số file ghi nhầm "Single Choice" -> số đáp án đúng mới là nguồn tin cậy
      choose: correct.length || 1,
      text: textMd,
      options,
      correct,
      expl: { why, distractors, tips, refs },
    });
  }
  return out;
}

/* ----------------------------------- Dojo ----------------------------------- */
export function parseDojo(file) {
  const text = clean(fs.readFileSync(file, 'utf8'));
  const blocks = splitBlocks(text, /^## Câu (\d+) \((.+)\)\s*$/);
  const out = [];
  for (const { head, body } of blocks) {
    const n = Number(head[1]);
    const domainRaw = (body.match(/^\*\*Domain:\*\*\s*\*?(.+?)\*?\s*$/m) || [])[1] || '';
    const textMd = between(body, /^### Đề bài.*$/m, [/^### Các lựa chọn/m]).trim();
    const optsMd = between(body, /^### Các lựa chọn.*$/m, [/^### Đáp án đúng/m]);
    const options = [];
    const correct = [];
    for (const line of optsMd.split('\n')) {
      const m = line.match(/^- \[([ xX])\]\s*\*\*([A-H])\.\*\*\s*(.*)$/);
      if (m) {
        options.push({ k: m[2], t: m[3].trim() });
        if (m[1].toLowerCase() === 'x') correct.push(m[2]);
      } else if (options.length && line.trim()) {
        options[options.length - 1].t += '\n' + line.trim();
      }
    }
    const expl = between(body, /^### Giải thích chi tiết.*$/m, [/^---\s*$/m]);
    const why = between(expl, /^#### 1\..*$/m, [/^#### 2\./m, /^#### 3\./m]).trim();
    const distractors = between(expl, /^#### 2\..*$/m, [/^#### 3\./m]).trim();
    const refs = parseRefs(between(expl, /^#### 3\..*$/m, []));
    out.push({
      n,
      topic: '',
      domain: normDomain(domainRaw),
      choose: correct.length || 1,
      text: textMd,
      options,
      correct,
      expl: { why, distractors, tips: '', refs },
    });
  }
  return out;
}

/* ------------------------------- Danh mục bộ đề ------------------------------- */
export const SOURCES = [
  { id: 'cloud-mentor', name: 'Cloud Mentor', desc: 'Practice Tests kèm phân tích kiến trúc & bẫy đề' },
  { id: 'dojo', name: 'Tutorials Dojo', desc: 'Review Mode Sets kèm giải thích đúng / sai chi tiết' },
  { id: 'udemy', name: 'Udemy', desc: 'Full-length Practice Exams (SAA-C03)' },
];

export function loadAll(srcDir) {
  const sets = [];
  const add = (source, id, title, file, parser) => {
    const f = path.join(srcDir, file);
    if (!fs.existsSync(f) || fs.statSync(f).size < 1000) {
      console.warn(`  ! bỏ qua ${file} (trống/không có)`);
      return;
    }
    sets.push({ source, id, title, questions: parser(f) });
  };
  for (let i = 1; i <= 6; i++) add('cloud-mentor', `cm${i}`, `Practice Test ${i}`, `Cloud_Mentor/pt_${i}.md`, parseMentorStyle);
  const dojoFiles = [
    ['dj1', 'Practice Exam Set 1', '01_Review_Mode_Set_1.md'],
    ['dj2', 'Practice Exam Set 2', '02_Review_Mode_Set_2.md'],
    ['dj3', 'Practice Exam Set 3', '03_Review_Mode_Set_3.md'],
    ['dj4', 'Practice Exam Set 4', '04_Review_Mode_Set_4.md'],
    ['dj5', 'Practice Exam Set 5', '05_Review_Mode_Set_5.md'],
    ['dj6', 'Practice Exam Set 6', '06_Review_Mode_Set_6.md'],
    ['dj8', 'Bonus Practice Set 8', '08_Bonus_Review_Mode_Set_8.md'],
  ];
  for (const [id, title, f] of dojoFiles) add('dojo', id, title, `Dojo/${f}`, parseDojo);
  // udemy_pt2: file nguồn chỉ còn đáp án đã chọn (thiếu phương án) -> loại; pt4/pt5 trống.
  for (const i of [1, 3, 6]) add('udemy', `ud${i}`, `Practice Exam ${i}`, `Udemy/udemy_pt${i}.md`, parseMentorStyle);
  return sets;
}

/** Kiểm tra chất lượng; trả về mảng lỗi. */
export function validate(sets) {
  const errs = [];
  for (const s of sets) {
    const seen = new Set();
    for (const q of s.questions) {
      const tag = `${s.id}#${q.n}`;
      if (seen.has(q.n)) errs.push(`${tag}: trùng số câu`);
      seen.add(q.n);
      if (!q.text || q.text.length < 20) errs.push(`${tag}: thiếu đề bài`);
      if (q.options.length < 2) errs.push(`${tag}: ${q.options.length} phương án`);
      if (!q.correct.length) errs.push(`${tag}: không có đáp án đúng`);
      const keys = q.options.map((o) => o.k);
      for (const c of q.correct) if (!keys.includes(c)) errs.push(`${tag}: đáp án ${c} không nằm trong ${keys}`);
      if (q.correct.length !== q.choose) errs.push(`${tag}: choose=${q.choose} nhưng ${q.correct.length} đáp án đúng`);
      if (!q.expl.why) errs.push(`${tag}: thiếu giải thích`);
      if (q.options.some((o) => !o.t)) errs.push(`${tag}: có phương án rỗng`);
    }
  }
  return errs;
}
