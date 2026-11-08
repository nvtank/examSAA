# Cloud Exam Pro

Ứng dụng luyện thi SAA-C03. Kho đề mã hóa được lọc trên server thành một bộ tổng hợp: gỡ nhãn đáp án khỏi nội dung, bỏ câu thiếu dữ liệu, loại câu trùng và câu trùng có đáp án mâu thuẫn. Việc kiểm tra này không thay thế rà soát chuyên môn từng lời giải AWS.

Luyện tập dùng toàn bộ bộ đề đã lọc; thi thử rút ngẫu nhiên 65 câu trong 160 phút. Màn hình làm bài dùng nút trước/tiếp và ô đi tới số câu, không có danh sách câu hỏi bên cạnh.

Bật **Tô sáng từ khóa**, chọn chữ trong đề hoặc một phương án rồi bấm **Tô đoạn đã chọn**. Tắt chế độ tô sáng để trả lời; **Xóa tô sáng** xóa các phần đã tô của câu hiện tại. Highlight được lưu theo câu trong phiên làm bài trên trình duyệt, kể cả sau khi tải lại trang.

Dùng Node.js 24 trở lên. Sao chép `.env.example` thành `.env.local`, điền khóa tương ứng kho đề và mã truy cập, rồi chạy:

```sh
npm ci
npm run audit:bank
npm test
npm run build
npm start -- -p 3100
```

`audit:bank` đọc `data-src` nếu có, hoặc giải mã kho đề hiện tại bằng `DATA_KEY`, rồi ghi thống kê theo bộ đề và số câu vào `artifacts/bank-quality.json`. Báo cáo không chứa nội dung câu hỏi hoặc khóa bí mật. `build:bank` yêu cầu dữ liệu Markdown gốc trong `data-src`; lệnh này không ghi đè kho hiện tại khi thiếu nguồn hoặc không còn câu đạt kiểm tra.

Kiểm tra API trên server đang chạy bằng `node scripts/smoke.mjs http://localhost:3100`. Nếu môi trường không chạy được Turbopack, có thể build bằng `npm run build -- --webpack`.

Đợt rà kho đề ngày 08/11/2026: 999 câu gốc, 137 câu có nhãn `[Đáp án đúng ✅]` (Cloud Mentor 1–6 và Udemy 6), 5 câu trùng; còn 994 câu sau lọc. Các nguồn Dojo, Udemy 1 và Udemy 3 không có nhãn này. Chi tiết lần rà nằm trong báo cáo cục bộ nêu trên.
