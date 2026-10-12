# Chìu ông hông bíc ăn gì

Web app chọn món cho Cá: Leeming hỏi vài câu A/B, gợi ý món, tìm quán đang mở gần nhất, lưu kỷ niệm kèm ảnh và thống kê khẩu vị theo tháng. App cài được lên màn hình điện thoại như một app thật.

```
index.html             Trang chính
css/app.css            Giao diện
js/config.js           ← dán Web app URL của Apps Script vào đây
js/app.js              Các màn hình
js/gas-shim.js         Giả lập Apps Script trong trình duyệt (dùng chung logic gợi ý với backend)
backend/Code.gs        Backend — bản này phải GIỐNG HỆT bản dán trong Apps Script
backend/HUONG_DAN.md   Hướng dẫn cài backend + tài liệu API
sw.js, manifest.webmanifest, icons/   Phần giúp app cài lên màn hình chính
```

## 1. Xem thử ngay trên máy tính (chưa cần backend)

Khi `API_URL` trong `js/config.js` còn trống, app chạy **chế độ dùng thử** với dữ liệu mẫu lưu trong trình duyệt.

```bash
cd thu-muc-app
python3 -m http.server 8000
```

Mở `http://localhost:8000`, rồi bấm F12 và chọn chế độ điện thoại để xem đúng khổ màn hình. Không mở trực tiếp file `index.html` bằng cách nhấp đúp, vì app cần chạy qua máy chủ mới tải được `backend/Code.gs`.

## 2. Đưa app lên mạng bằng GitHub Pages (miễn phí)

1. Tạo tài khoản GitHub (nếu chưa có), bấm **New repository**, đặt tên ví dụ `chiu-ong`.
   - Chọn **Public**: GitHub Pages miễn phí chỉ hỗ trợ repo công khai.
   - Repo công khai thì ai cũng xem được code, nhưng dữ liệu vẫn an toàn vì cần mã truy cập.
2. Trong repo, bấm **Add file > Upload files**, kéo **toàn bộ nội dung** thư mục app vào (giữ nguyên cấu trúc thư mục), rồi bấm **Commit changes**.
3. Vào **Settings > Pages**:
   - *Source*: **Deploy from a branch**.
   - *Branch*: **main**, thư mục **/ (root)**.
   - Bấm **Save**.
4. Chờ 1–2 phút, link app sẽ có dạng `https://<tên-github>.github.io/chiu-ong/`.

Mở link này lên là thấy app ở chế độ dùng thử.

## 3. Nối app với Google Sheet

1. Làm xong backend theo `backend/HUONG_DAN.md`, lấy được **Web app URL** và **mã truy cập**.
2. Trên GitHub, mở `js/config.js`, bấm biểu tượng bút chì, dán URL vào `API_URL: '…'`, rồi **Commit**.
3. Mở app trên điện thoại bằng link có kèm mã:

   ```
   https://<tên-github>.github.io/chiu-ong/?k=MA_TRUY_CAP
   ```

   App tự lưu mã rồi xóa nó khỏi thanh địa chỉ. Những lần sau chỉ cần mở link bình thường. Nếu mở không kèm mã, app sẽ hiện ô cho nhập mã.

> **Không dán mã truy cập vào `config.js`**, vì repo công khai ai cũng đọc được file này.

## 4. Cài lên màn hình chính của Cá

- **iPhone**: mở link bằng **Safari**, bấm nút Chia sẻ rồi chọn **Thêm vào MH chính**.
- **Android**: mở bằng **Chrome**, bấm menu ⋮ rồi chọn **Cài đặt ứng dụng** (hoặc *Thêm vào màn hình chính*).

App sẽ có icon riêng và mở toàn màn hình. Lần đầu bấm **Đi luôn**, điện thoại sẽ hỏi quyền vị trí. Cá cho phép thì app mới tìm được quán gần nhất.

## 5. Chuẩn bị quà

- **Lời chúc**: điền vào ô `birthday_message` trong sheet **Config**. Muốn xuống dòng thì bấm Ctrl+Enter trong ô. Lời chúc hiện **một lần** khi Cá mở app, sau đó xem lại được trong Cài đặt.
- **Vị trí nhà**: điền `home_lat` / `home_lng` trong Config. App dùng vị trí này khi Cá không bật định vị.
- **Dữ liệu**:
  - Xóa 3 quán có chữ `[Mẫu]`.
  - Thêm quán và món thật, ngay trong app (tab Sổ quán) hoặc nhập thẳng vào Sheet.
  - Mỗi quán nhớ tick các món quán có bán, vì app chỉ gợi ý quán bán đúng món đã chọn.
- **Câu hỏi**: thêm hoặc sửa ở sheet **Questions**. Luật lọc viết dạng `cay=TRUE`, nhiều điều kiện thì nối bằng `;`.
- **Thử trước khi tặng**: mở app ở tab ẩn danh để thấy đúng trải nghiệm lần đầu của Cá, kể cả màn lời chúc.

## 6. Khi sửa code

- Sửa backend: cập nhật **cả** bản trong Apps Script (rồi *Deploy > Manage deployments > New version*) **lẫn** `backend/Code.gs` trên GitHub.
- Sửa giao diện: đổi `VERSION` trong `sw.js` (ví dụ `leeming-v2`) để điện thoại tải bản mới ngay.
