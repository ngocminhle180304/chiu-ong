# Chìu ông hông bíc ăn gì

Web app chọn món cho Cá: Leeming gợi ý nhanh theo thời tiết, giờ, tâm trạng và dịp đặc biệt (hoặc hỏi vài câu A/B), gợi ý món, tìm quán đang mở gần nhất, lưu kỷ niệm kèm ảnh và thống kê khẩu vị theo tháng. App cài được lên màn hình điện thoại như một app thật.

```
index.html             Trang chính
css/app.css            Giao diện
js/config.js           ← dán Web app URL của Apps Script vào đây
js/app.js              Các màn hình
js/context.js          Vị trí, thời tiết (Open-Meteo), quán quanh đây (OpenStreetMap) và lựa chọn tâm trạng/dịp
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

App sẽ có icon riêng và mở toàn màn hình. Lần đầu bấm **Gợi ý nhanh ⚡**, chip 📍 vị trí hoặc **Đi luôn**, điện thoại sẽ hỏi quyền vị trí. Cá cho phép thì app mới tìm được quán gần nhất, xem được thời tiết chỗ Cá đang đứng và dò quán mới quanh đây. Không cho phép thì app dùng vị trí nhà trong Config.

## 5. Chuẩn bị quà

- **Lời chúc**: điền vào ô `birthday_message` trong sheet **Config**. Muốn xuống dòng thì bấm Ctrl+Enter trong ô. Lời chúc hiện **một lần** khi Cá mở app, sau đó xem lại được trong Cài đặt.
- **Vị trí nhà**: điền `home_lat` / `home_lng` trong Config. App dùng vị trí này khi Cá không bật định vị (để tính khoảng cách và xem thời tiết).
- **Ngày đặc biệt**: trong sheet **ContextRules**, điền cột `date` của dòng **Sinh nhật Cá** và **Ngày kỷ niệm** theo dạng `MM-DD` (ví dụ `07-15`). Đúng ngày đó app tự bật chip dịp, Leeming chào một câu và ưu tiên món, quán xịn hơn. 20/10, 8/3, Valentine đã có sẵn.
- **Ngữ cảnh**: sửa luật trong sheet **ContextRules** (xem `backend/HUONG_DAN.md`, mục 3). Muốn ngữ cảnh ảnh hưởng mạnh hay nhẹ hơn thì đổi `context_strength` trong Config.
- **Dữ liệu**:
  - Xóa 3 quán có chữ `[Mẫu]`.
  - Thêm quán và món thật, ngay trong app (tab Sổ quán) hoặc nhập thẳng vào Sheet.
  - Mỗi quán nhớ tick các món quán có bán, vì app chỉ gợi ý quán bán đúng món đã chọn.
- **Phân loại**: vào **Cài đặt > Phân loại quán & món** để thêm, đổi tên, sắp xếp hoặc xóa. Ô *Phân loại* khi thêm quán/món chỉ cho chọn trong danh sách này. Xóa phân loại đang dùng thì app hỏi chuyển các quán/món đó sang phân loại nào.
- **Điểm quán**: chấm 4 tiêu chí 0–5 (Chất lượng, Giá, Không gian, Phục vụ). App tự tính *Điểm chung*, không nhập tay. Ô *Giá (đồng)* vẫn là khoảng giá tiền thật.
- **Đặc điểm món**: chia 4 nhóm (Vị, Dạng món, Nền ẩm thực, Thành phần chính), lấy từ các cột của sheet **Dishes**.
- **Ghi kỷ niệm**: màn lưu bữa ăn có 3 phần: **Quán** (chấm 4 tiêu chí cho riêng bữa đó) → **Món đã thử** (bấm “Thêm món”, chọn món có sẵn hoặc tạo món mới, mỗi món chấm 1–5 sao kèm ghi chú) → **Cảm nhận** (ảnh, vị, cảm nhận). Điểm quán trong sổ là trung bình các bữa đã ăn; món chưa có ở quán thì tự gán vào quán.
- **Câu hỏi**: thêm hoặc sửa ở sheet **Questions**. Luật lọc viết dạng `cay=TRUE`, nhiều điều kiện thì nối bằng `;`.
- **Thử trước khi tặng**: mở app ở tab ẩn danh để thấy đúng trải nghiệm lần đầu của Cá, kể cả màn lời chúc.

## 6. Khi sửa code

- Sửa backend: cập nhật **cả** bản trong Apps Script (rồi *Deploy > Manage deployments > New version*) **lẫn** `backend/Code.gs` trên GitHub. Đổi API hoặc sheet thì tăng số trong `backendVersion_()` của `Code.gs`, để app biết khi Apps Script chưa deploy bản mới.
- Sửa giao diện: đổi `VERSION` trong `sw.js`, `APP_VERSION` trong `js/app.js` và số `?v=` trong `index.html` (ví dụ `leeming-v13` / `?v=13`) để điện thoại tải bản mới ngay. Phiên bản đang chạy hiện ở cuối màn Cài đặt.
- `js/gas-shim.js` chỉ giả lập các dịch vụ của Google (Sheet, Drive, Utilities…). Logic thật (gợi ý, điểm quán, phân loại, migration) nằm hết trong `backend/Code.gs` và được app nạp nguyên file, nên sửa `Code.gs` là chế độ dùng thử cũng chạy theo.

## 7. Nâng cấp lên V2 (phân loại cố định, 4 điểm quán, thuộc tính món theo nhóm)

1. Làm phần backend theo mục *Nâng cấp từ bản cũ lên V2* trong `backend/HUONG_DAN.md`: dán `Code.gs` mới → `setupSheets` → `migrateSchemaV2` → deploy **New version**.
2. Đưa toàn bộ frontend mới lên GitHub (`index.html`, `css/`, `js/`, `sw.js`, `backend/Code.gs`). `sw.js` đã lên `leeming-v2` nên điện thoại sẽ tải bản mới.
3. Chế độ dùng thử trên máy nào còn dữ liệu mẫu cũ thì app tự nâng cấp dữ liệu đó khi mở lên.

## 9. Cập nhật bản Đánh giá theo bữa

1. Backend: dán `Code.gs` mới → chạy lại `setupSheets` (tạo sheet **MealDishes**, thêm 4 cột điểm vào **Meals**) → deploy **New version**. Chi tiết ở `backend/HUONG_DAN.md`.
2. Frontend: merge lên GitHub. Phiên bản trong Cài đặt sẽ là `leeming-v9`.
3. Nên cập nhật backend trước khi dùng. Apps Script còn bản cũ thì bữa ăn vẫn lưu được, nhưng 4 điểm quán và món đã thử sẽ bị bỏ qua, không báo lỗi. Đã dán `Code.gs` mới mà chưa chạy `setupSheets` thì lưu bữa có món sẽ báo thiếu sheet MealDishes.

## 8. Cập nhật bản Gợi ý theo ngữ cảnh

1. Backend: làm theo mục *Cập nhật bản "Gợi ý theo ngữ cảnh"* trong `backend/HUONG_DAN.md`: dán `Code.gs` mới → chạy lại `setupSheets` → điền ngày sinh nhật/kỷ niệm trong **ContextRules** → deploy **New version**.
2. Frontend: đưa lên GitHub cả file mới `js/context.js`. Phiên bản trong Cài đặt sẽ là `leeming-v5`.
3. Frontend mới vẫn chạy được với backend cũ (Gợi ý nhanh chạy ngay trên máy), nhưng chưa có chip tâm trạng/dịp và chưa lưu ngữ cảnh cho tới khi backend được cập nhật.
