# Cloud Exam Pro

Ứng dụng luyện thi SAA-C03. Kho đề giữ nguyên từng bộ theo Cloud Mentor, Tutorials Dojo và Udemy. Server gỡ nhãn đáp án khỏi nội dung, bỏ câu thiếu dữ liệu và loại câu trùng hoặc mâu thuẫn đáp án trong cùng một bộ. Câu giống nhau ở hai bộ khác nhau vẫn thuộc từng bộ gốc. Việc kiểm tra này không thay thế rà soát chuyên môn từng lời giải AWS.

Luyện tập và thi thử dùng đúng bộ đề đã chọn, theo thứ tự gốc trừ khi bật xáo trộn. Bộ 65 câu có 160 phút; bộ ngắn hơn được quy đổi thời gian theo số câu. Tab **Đề trộn** là lựa chọn riêng khi muốn trộn các bộ. Danh sách câu hỏi nằm bên phải trên desktop, có trạng thái câu hiện tại, đã chọn, đánh dấu và kết quả sau khi kiểm tra trong luyện tập. Trên điện thoại, bấm **Danh sách câu hỏi** để mở bảng từ bên phải và chọn số câu cần tới.

Trong bài thi, bấm **Tạm dừng** để dừng đồng hồ và lưu câu trả lời, vị trí, đánh dấu và tô sáng. Trang tạm dừng ẩn câu hỏi. Bấm **Tiếp tục bài thi** để chạy đồng hồ trở lại, hoặc về trang chủ rồi quay lại sau. Tải lại trang hay đóng trình duyệt sau khi bấm tạm dừng không làm mất thời gian còn lại. Thời gian nghỉ không tính vào thời gian làm bài trong lịch sử. Phiên mới có hiệu lực 30 ngày và tiến độ được lưu trên trình duyệt đang dùng.

Bôi chọn chữ trong đề hoặc phương án để mở popup nhỏ cạnh vùng chọn, rồi bấm **Tô sáng**. Bấm phần đã tô để mở popup **Bỏ tô sáng**. Highlight được lưu theo câu trong phiên làm bài trên trình duyệt, kể cả sau khi tải lại trang.

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

Đợt rà kho đề ngày 08/11/2026: 999 câu trong 16 bộ (6 Cloud Mentor, 7 Dojo, 3 Udemy); đã gỡ nhãn `[Đáp án đúng ✅]` khỏi 137 câu ở Cloud Mentor 1–6 và Udemy 6. Có 5 câu giống nhau giữa các bộ, được giữ trong từng bộ tương ứng để bảo toàn đề gốc. Các nguồn Dojo, Udemy 1 và Udemy 3 không có nhãn này. Chi tiết lần rà nằm trong báo cáo cục bộ nêu trên.
