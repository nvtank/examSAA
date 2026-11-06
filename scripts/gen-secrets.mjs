// Sinh secrets ngẫu nhiên. `npm run gen:secrets` -> in ra terminal (dán vào Vercel).
// `npm run gen:secrets -- --write` -> ghi vào .env.local (không in giá trị).
import crypto from 'node:crypto';
import fs from 'node:fs';
const b64 = (n) => crypto.randomBytes(n).toString('base64');
const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = Array.from(crypto.randomBytes(18), (b) => alphabet[b % alphabet.length]).join('');
const vars = {
  DATA_KEY: b64(32),
  SESSION_SECRET: b64(32),
  ACCESS_CODES: code,
};
if (process.argv.includes('--write')) {
  if (fs.existsSync('.env.local')) {
    console.error('.env.local đã tồn tại — không ghi đè. Xóa file nếu muốn tạo lại.');
    process.exit(1);
  }
  fs.writeFileSync('.env.local', Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  console.log('Đã tạo .env.local (DATA_KEY, SESSION_SECRET, ACCESS_CODES).');
} else {
  for (const [k, v] of Object.entries(vars)) console.log(`${k}=${v}`);
}
