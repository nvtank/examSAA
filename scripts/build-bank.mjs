// Đọc data-src/*.md -> chuẩn hóa -> nén gzip -> mã hóa AES-256-GCM -> src/server/data/bank.enc.json
// Kho đề KHÔNG bao giờ nằm ở dạng rõ trong repo / bundle / public.
import crypto from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { loadEnvFile } from './lib/env.mjs';
import { loadAll, validate, SOURCES } from './lib/parse.mjs';
import { curateSets } from '../src/lib/question-quality.ts';

loadEnvFile();
const checkOnly = process.argv.includes('--check');

console.log('Đang đọc data-src ...');
const original = loadAll('data-src');
if (!original.length) {
  console.error('Không có dữ liệu nguồn trong data-src. Kho đề hiện có được giữ nguyên.');
  process.exit(1);
}
const curated = curateSets(original, { deduplicate: 'set' });
const retained = new Set(curated.questions);
const sets = curated.cleaned.map((s) => ({ ...s, questions: s.questions.filter((q) => retained.has(q)) })).filter((s) => s.questions.length);
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/bank-quality.json', JSON.stringify(curated.report, null, 2));
const errs = validate(sets);
if (!curated.questions.length) errs.push('Không có câu hỏi đạt kiểm tra chất lượng');
const total = sets.reduce((a, s) => a + s.questions.length, 0);
console.log(`  ${sets.length} bộ đề, ${total} câu hỏi, ${errs.length} lỗi`);
console.log(`  Đã lọc ${curated.report.total - total} câu. Báo cáo: artifacts/bank-quality.json`);
if (errs.length) {
  console.error(errs.join('\n'));
  process.exit(1);
}
if (checkOnly) process.exit(0);

const keyB64 = process.env.DATA_KEY;
if (!keyB64) {
  console.error('Thiếu DATA_KEY. Chạy: npm run gen:secrets -- --write');
  process.exit(1);
}
const key = Buffer.from(keyB64, 'base64');
if (key.length !== 32) {
  console.error('DATA_KEY phải là 32 byte (base64).');
  process.exit(1);
}

const payload = zlib.gzipSync(Buffer.from(JSON.stringify({ sources: SOURCES, sets }), 'utf8'), { level: 9 });
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
cipher.setAAD(Buffer.from('cep-bank-v1'));
const data = Buffer.concat([cipher.update(payload), cipher.final()]);
const out = { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
fs.mkdirSync('src/server/data', { recursive: true });
fs.writeFileSync('src/server/data/bank.enc.json', JSON.stringify(out));
console.log(`Đã ghi src/server/data/bank.enc.json (${(data.length / 1024).toFixed(0)} KB, mã hóa AES-256-GCM)`);
