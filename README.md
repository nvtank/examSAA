# Cloud Exam Pro — AWS SAA-C03 Practice

Web luyện đề SAA-C03 (Next.js 16 + Tailwind, giao diện trắng–cam). ~999 câu từ Cloud Mentor (6 bộ), Dojo (7 bộ), Udemy (3 bộ).

- **Luyện tập**: chọn đáp án → hiện đúng/sai + giải thích ngay.
- **Thi thử**: đếm ngược 160 phút (65 câu), không lộ đáp án, nộp bài mới chấm; đạt ≥ 72%.
- Đề trộn theo domain, ôn lại câu sai, đánh dấu câu, lịch sử & thống kê (lưu trong trình duyệt).

## Chạy local

```bash
npm install
npm run gen:secrets -- --write   # tạo .env.local (DATA_KEY, SESSION_SECRET, ACCESS_CODES)
npm run build:bank               # data-src/*.md -> src/server/data/bank.enc.json (đã mã hóa)
npm run dev
```

Mã đăng nhập nằm ở `ACCESS_CODES` trong `.env.local` (có thể đặt nhiều mã, cách nhau dấu phẩy).

## Bảo mật kho đề (đọc kỹ trước khi deploy)

Không có cách nào chặn 100% việc người đã vào được hệ thống chép đề bằng tay. Mục tiêu ở đây là **không cho người lạ/bot cào hàng loạt**:

| Lớp | Cách làm |
|---|---|
| Dữ liệu nghỉ | Kho đề mã hóa AES-256-GCM (`bank.enc.json`). Khóa `DATA_KEY` chỉ nằm trong env Vercel. Repo GitHub có lộ cũng không đọc được. Markdown gốc (`data-src/`) bị `.gitignore`. |
| Không có file đề public | Không có `public/*.json`; bundle client không chứa đề (đã grep kiểm tra). Đề chỉ ra qua API. |
| Đăng nhập | Phải có mã truy cập; cookie HttpOnly + SameSite=Strict + Secure, ký HMAC, hết hạn 7 ngày. Chống dò mật khẩu: 8 lần/10 phút/IP. |
| Đáp án bị giữ lại | Đề gửi xuống **không kèm đáp án**. Luyện tập: lộ từng câu sau khi chọn (`/api/check`). Thi thử: chỉ lộ khi nộp bài (`/api/submit`). Token phiên ký HMAC, không giả mạo được. |
| Hạn mức | Xem đáp án: 30 câu/phút, 700 câu/ngày theo mã + IP (đổi bằng `REVEAL_LIMIT_*`). Dump cả kho 999 câu mất > 1 ngày. |
| Chống bot | Chặn User-Agent của curl/python/scrapy/headless…, bắt buộc header riêng + Origin cùng site (chống CSRF/gọi chéo). Chỉ là hàng rào đầu. |
| Khác | CSP, X-Frame-Options, HSTS, noindex + robots.txt, tiêu đề câu hỏi (lộ đáp án) chỉ hiện sau khi trả lời. |

**Rất nên bật** Upstash Redis (miễn phí, qua Vercel Marketplace) và điền `UPSTASH_REDIS_REST_URL/TOKEN`: serverless có nhiều instance nên rate-limit trong bộ nhớ chỉ là best-effort.

> Đề gốc là nội dung có bản quyền của bên thứ ba (Udemy, Tutorials Dojo, Cloud Mentor). Giữ repo ở chế độ **private** và chỉ dùng cá nhân.

## Deploy Vercel

1. `npm run gen:secrets` → lấy `DATA_KEY`, `SESSION_SECRET`, `ACCESS_CODES` (có thể tự đặt mã dễ nhớ nhưng ≥ 8 ký tự).
2. **`DATA_KEY` phải trùng khóa đã dùng khi chạy `npm run build:bank`.** Nếu đổi khóa → chạy lại `build:bank` và commit `bank.enc.json` mới.
3. Vercel → Project → Settings → Environment Variables: thêm 3 biến trên (+ Upstash nếu có).
4. Push GitHub (repo private) → Import vào Vercel → Deploy.

## Cập nhật / thêm đề

Sửa/ thêm file trong `data-src/` rồi `npm run check:bank` (kiểm tra cấu trúc) → `npm run build:bank` → commit `src/server/data/bank.enc.json`.

Hiện bỏ qua: `Udemy/udemy_pt2.md` (file nguồn chỉ còn đáp án đã chọn, mất các phương án khác), `udemy_pt4/pt5.md` (file rỗng trên GitHub).

## Test bảo mật nhanh

```bash
npm run build && npm start -- -p 3100
node scripts/smoke.mjs http://localhost:3100   # 28 kiểm tra
```
