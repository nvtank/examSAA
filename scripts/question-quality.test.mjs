import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanQuestionText, cleanOptionText, curateSets, questionIssues } from '../src/lib/question-quality.ts';
import { highlightMarkdown } from '../src/lib/markdown-highlights.ts';

const question = (overrides = {}) => ({
  n: 1, topic: '', domain: 'secure', choose: 1,
  text: 'A company needs a private connection between two services. Which solution meets these requirements?',
  options: [
    { k: 'A', t: 'Use a private endpoint.' }, { k: 'B', t: 'Use a public endpoint.' },
    { k: 'C', t: 'Use a public proxy.' }, { k: 'D', t: 'Use an internet gateway.' },
  ],
  correct: ['A'], expl: { why: 'A private endpoint provides private network access to the service.', distractors: '', tips: '', refs: '' },
  ...overrides,
});
const set = (id, questions) => ({ id, source: 'test', title: id, questions });

test('removes the actual backtick answer marker without losing option text', () => {
  assert.equal(cleanOptionText('Use a private endpoint. `[Đáp án đúng ✅]`'), 'Use a private endpoint.');
  assert.equal(cleanOptionText('Use a private endpoint. `[Lựa chọn của bạn ❌]`'), 'Use a private endpoint.');
  assert.equal(cleanOptionText('Use a private endpoint. [Correct Answer]'), 'Use a private endpoint.');
});

test('removes answer metadata above the stem and explanation below it', () => {
  const stem = question().text;
  assert.equal(cleanQuestionText(`**Đáp án đúng:** (A)\n\n${stem}\n\n#### 💡 Giải thích chi tiết\nThe answer is A.`), stem);
  assert.equal(cleanQuestionText(`${stem}\n\n<details>\n<summary>Answer</summary>\nA\n</details>`), stem);
});

test('retains normal question text and code', () => {
  const text = 'Which statement is correct? Use `aws s3 sync` to compare the two buckets. Select two answers.';
  assert.equal(cleanQuestionText(text), text);
  assert.deepEqual(questionIssues(question({ text: 'Which statement is correct for private endpoints and network connectivity?' })), []);
});

test('cleans visible answer markers without altering answer keys or explanations', () => {
  const q = question();
  q.options[0].t += ' `[Đáp án đúng ✅]`';
  const result = curateSets([set('cm1', [q])]);
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].options[0].t, 'Use a private endpoint.');
  assert.deepEqual(result.questions[0].correct, ['A']);
  assert.deepEqual(result.questions[0].expl, q.expl);
  assert.deepEqual(result.report.sets[0].repaired, [1]);
  assert.match(q.options[0].t, /Đáp án đúng/);
});

test('rejects incomplete questions and mismatched multi-select instructions', () => {
  const cases = [
    question({ options: question().options.slice(0, 2) }),
    question({ correct: [] }), question({ correct: ['H'] }),
    question({ expl: { why: '', distractors: '', tips: '', refs: '' } }),
    question({ text: question().text + ' (Choose two.)' }),
    question({ options: question().options.map((o) => ({ ...o, t: 'Same option' })) }),
  ];
  assert.ok(cases.every((q) => questionIssues(q).length > 0));
  assert.equal(curateSets([set('bad', cases)]).questions.length, 0);
});

test('deduplicates reordered options using content and keeps the fuller explanation', () => {
  const q = question();
  const copy = question({
    n: 2,
    options: [q.options[1], q.options[0], q.options[2], q.options[3]].map((o, i) => ({ ...o, k: 'ABCD'[i] })),
    correct: ['B'],
    expl: { ...q.expl, why: q.expl.why + ' This is an additional explanation.' },
  });
  const result = curateSets([set('one', [q]), set('two', [copy])]);
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].n, 2);
  assert.deepEqual(result.report.duplicates, [{ kept: 'two#2', removed: 'one#1' }]);
});

test('quarantines conflicting answer keys instead of picking a winner', () => {
  const result = curateSets([set('one', [question()]), set('two', [question({ correct: ['B'] })])]);
  assert.equal(result.questions.length, 0);
  assert.deepEqual(result.report.conflicts, [['one#1', 'two#1']]);
  assert.ok(result.cleaned.every((s) => s.questions.length === 0));
});

test('per-set filtering preserves original sources, sets and cross-set copies', () => {
  const original = [set('cm1', [question(), question({ n: 2 })]), set('dj1', [question()])];
  original[1].source = 'dojo';
  const result = curateSets(original, { deduplicate: 'set' });
  const retained = new Set(result.questions);
  const displayed = result.cleaned.map((s) => ({ ...s, questions: s.questions.filter((q) => retained.has(q)) }));
  assert.equal(result.questions.length, 2);
  assert.deepEqual(displayed.map((s) => [s.id, s.source, s.questions.length]), [['cm1', 'test', 1], ['dj1', 'dojo', 1]]);
  assert.deepEqual(result.report.duplicates, [{ kept: 'cm1#1', removed: 'cm1#2' }]);
});

test('preserves questions with distinct options and is idempotent', () => {
  const original = question();
  const other = question({ n: 2, options: question().options.map((o) => ({ ...o, t: o.t + ' Modified.' })) });
  const first = curateSets([set('test', [original, other])]);
  const again = curateSets(first.cleaned);
  assert.equal(first.questions.length, 2);
  assert.deepEqual(first.questions, again.questions);
});

test('highlights phrases across formatted nodes, handles overlaps, and keeps HTML as text', () => {
  const tree = { type: 'root', children: [{ type: 'element', tagName: 'p', children: [
    { type: 'text', value: 'Use Amazon ' },
    { type: 'element', tagName: 'strong', children: [{ type: 'text', value: 'S3' }] },
    { type: 'text', value: ' and <script>.' },
  ] }] };
  highlightMarkdown({ terms: ['Amazon S3', 'S3', '<script>'] })(tree);
  const marks = [];
  const removableTerms = [];
  const visit = (node) => {
    if (node.tagName === 'mark') {
      marks.push(node.children[0].value);
      removableTerms.push(JSON.parse(node.properties['data-highlight-terms']));
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  assert.deepEqual(marks, ['Amazon ', 'S3', '<script>']);
  assert.deepEqual(removableTerms, [['Amazon S3'], ['Amazon S3', 'S3'], ['<script>']]);
  assert.equal(tree.children[0].children[1].type, 'element');
});
