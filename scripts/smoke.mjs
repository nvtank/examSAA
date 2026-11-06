// Smoke test bảo mật + luồng API (chỉ dùng khi dev). Chạy: node scripts/smoke.mjs http://localhost:3100
import { loadEnvFile } from './lib/env.mjs';
loadEnvFile();
const base = process.argv[2] || 'http://localhost:3100';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const code = process.env.ACCESS_CODES.split(',')[0];
let pass = 0;
let failN = 0;
const t = (name, ok, extra = '') => {
  ok ? pass++ : failN++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
};
const hdr = (extra = {}) => ({ 'User-Agent': UA, 'x-cep': '1', Origin: base, ...extra });
const req = (p, o = {}) => fetch(base + p, { redirect: 'manual', ...o });
const post = (p, h, body) => req(p, { method: 'POST', headers: h, body: JSON.stringify(body) });

let r = await req('/api/catalog', { headers: { 'User-Agent': 'curl/8.0' } });
t('curl UA bị chặn', r.status === 403, r.status);
r = await req('/api/catalog', { headers: { 'User-Agent': UA } });
t('thiếu header x-cep bị chặn', r.status === 403, r.status);
r = await req('/api/catalog', { headers: hdr() });
t('chưa đăng nhập -> 401', r.status === 401, r.status);
r = await post('/api/auth/login', hdr({ 'Content-Type': 'application/json' }), { code: 'sai-mat-khau-123' });
t('mật khẩu sai -> 401', r.status === 401, r.status);
r = await post('/api/auth/login', hdr({ 'Content-Type': 'application/json', Origin: 'https://evil.example' }), { code });
t('Origin lạ bị chặn (CSRF)', r.status === 403, r.status);
r = await post('/api/auth/login', hdr({ 'Content-Type': 'application/json' }), { code });
const setCookie = r.headers.get('set-cookie') || '';
t('đăng nhập đúng -> 200 + cookie HttpOnly/SameSite=Strict', r.status === 200 && /HttpOnly/i.test(setCookie) && /SameSite=Strict/i.test(setCookie), r.status);
const cookie = setCookie.split(';')[0];
const H = (x = {}) => hdr({ Cookie: cookie, 'Content-Type': 'application/json', ...x });

r = await req('/api/catalog', { headers: H() });
const cat = await r.json();
t('catalog có dữ liệu', r.status === 200 && cat.totalQuestions === 999, `total=${cat.totalQuestions}`);
t('catalog KHÔNG chứa câu hỏi/đáp án', !/correct|options|expl/i.test(JSON.stringify(cat)));

const setId = cat.sources[0].sets[0].id;
r = await post('/api/session', H(), { mode: 'practice', setId });
const s = await r.json();
t('tạo phiên practice', r.status === 200 && s.questions.length === 65, `${s.questions?.length} câu`);
t('DTO câu hỏi KHÔNG lộ đáp án', !/"correct"|"expl"|"topic"/.test(JSON.stringify(s.questions)));
const q0 = s.questions[0];
r = await post('/api/check', H(), { token: s.token, id: q0.id, sel: [] });
t('check không chọn gì -> 400', r.status === 400, r.status);
r = await post('/api/check', H(), { token: s.token, id: q0.id, sel: [q0.options[0].k] });
const c = await r.json();
t('check trả đáp án + giải thích', r.status === 200 && Array.isArray(c.correct) && !!c.expl?.why, JSON.stringify(c.correct));
r = await post('/api/check', H(), { token: s.token + 'x', id: q0.id, sel: ['A'] });
t('token giả mạo bị từ chối', r.status === 400, r.status);
r = await post('/api/check', H(), { token: s.token, id: 'khongtontai', sel: ['A'] });
t('id ngoài phiên bị từ chối', r.status === 400, r.status);

r = await post('/api/session', H(), { mode: 'exam', setId });
const e = await r.json();
t('exam: 160 phút', e.durationSec === 160 * 60, `${e.durationSec}s`);
t('exam: DTO không có domain', !('domain' in e.questions[0]));
r = await post('/api/check', H(), { token: e.token, id: e.questions[0].id, sel: ['A'] });
t('exam: /check bị từ chối (không lộ đáp án giữa chừng)', r.status === 400, r.status);
r = await post('/api/submit', H(), { token: s.token, answers: {} });
t('submit bằng token practice bị từ chối', r.status === 400, r.status);
r = await post('/api/submit', H(), { token: e.token, answers: {} });
const res = await r.json();
t('submit rỗng: 0%, chưa đạt, 65 mục', r.status === 200 && res.percent === 0 && res.passed === false && res.items.length === 65, `items=${res.items?.length}`);
const perfect = Object.fromEntries(res.items.map((i) => [i.id, i.correct]));
const e2 = await (await post('/api/session', H(), { mode: 'exam', setId })).json();
const res2 = await (await post('/api/submit', H(), { token: e2.token, answers: perfect })).json();
t('submit đúng hết -> 100% đạt', res2.percent === 100 && res2.passed === true, `${res2.percent}% ~${res2.scaled}`);
const part = Object.fromEntries(res.items.slice(0, 47).map((i) => [i.id, i.correct]));
const e3 = await (await post('/api/session', H(), { mode: 'exam', setId })).json();
const res3 = await (await post('/api/submit', H(), { token: e3.token, answers: part })).json();
t('ngưỡng đạt: 47/65 = 72.3% -> đạt', res3.passed === true, `${res3.percent}%`);

r = await post('/api/session', H(), { mode: 'practice', mix: { count: 20, domains: ['cost'] } });
const m = await r.json();
t('đề trộn 20 câu domain cost', m.questions?.length === 20 && m.questions.every((x) => x.domain === 'cost'));

let limited = 0;
for (let i = 0; i < 40; i++) {
  const qq = s.questions[i % 65];
  const rr = await post('/api/check', H(), { token: s.token, id: qq.id, sel: [qq.options[0].k] });
  if (rr.status === 429) limited++;
}
t('quota xem đáp án kích hoạt (429) khi dồn dập', limited > 0, `${limited}/40 bị chặn`);

r = await req('/', { headers: { 'User-Agent': UA } });
t('trang chủ chưa đăng nhập -> redirect /login', r.status === 307 && (r.headers.get('location') || '').includes('/login'), `${r.status} ${r.headers.get('location')}`);
r = await req('/', { headers: { 'User-Agent': UA, Cookie: cookie } });
t('trang chủ đã đăng nhập -> 200', r.status === 200, r.status);
const hh = r.headers;
t(
  'security headers (CSP, XFO, nosniff, noindex)',
  !!hh.get('content-security-policy') && hh.get('x-frame-options') === 'DENY' && hh.get('x-content-type-options') === 'nosniff' && /noindex/.test(hh.get('x-robots-tag') || ''),
);
r = await req('/data-src/Dojo/01_Review_Mode_Set_1.md', { headers: { 'User-Agent': UA } });
t('file dữ liệu thô không truy cập được', r.status === 404, r.status);
r = await req('/bank.enc.json', { headers: { 'User-Agent': UA } });
t('bank.enc.json không public', r.status === 404, r.status);
console.log(`\n${pass} pass, ${failN} fail`);
process.exit(failN ? 1 : 0);
