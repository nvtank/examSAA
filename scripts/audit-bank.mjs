import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { loadEnvFile } from './lib/env.mjs';
import { loadAll } from './lib/parse.mjs';
import { curateSets } from '../src/lib/question-quality.ts';

loadEnvFile();
let sets;
if (fs.existsSync('data-src')) {
  sets = loadAll('data-src');
} else {
  if (!process.env.DATA_KEY) {
    console.error('Cần data-src hoặc DATA_KEY trong .env.local để rà kho đề đã mã hóa.');
    process.exit(1);
  }
  const blob = JSON.parse(fs.readFileSync('src/server/data/bank.enc.json', 'utf8'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(process.env.DATA_KEY, 'base64'), Buffer.from(blob.iv, 'base64'));
  decipher.setAAD(Buffer.from('cep-bank-v1'));
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
  const data = Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()]);
  sets = JSON.parse(zlib.gunzipSync(data).toString('utf8')).sets;
}
if (!sets.length) throw new Error('Không tìm thấy bộ đề nào');
const { report } = curateSets(sets, { deduplicate: 'set' });
for (const set of report.sets) console.log(`${set.id} · ${set.title}: ${set.total} câu, ${set.repaired.length} câu gỡ dấu đáp án, ${set.rejected.length} câu loại`);
console.log(`Giữ ${report.retained}/${report.total} câu; ${report.duplicates.length} câu trùng; ${report.conflicts.length} nhóm mâu thuẫn đáp án.`);
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/bank-quality.json', JSON.stringify(report, null, 2));
console.log('Chi tiết theo bộ đề/số câu: artifacts/bank-quality.json');
