# Chìu ông hông bíc ăn gì — Backend

Backend chạy trên **Google Sheets + Apps Script**, lưu ảnh vào **Google Drive**. Chi phí: 0đ.

## 1. Cài đặt (khoảng 10 phút)

1. Vào [sheets.new](https://sheets.new) để tạo Google Sheet mới, đặt tên `Chìu ông hông bíc ăn gì - Data`.
2. Vào **File > Settings**, chọn Time zone **(GMT+07:00) Bangkok/Hanoi**. Bước này cần để giờ mở cửa tính đúng.
3. Vào **Extensions > Apps Script**, xóa code mặc định, dán toàn bộ `Code.gs`, rồi bấm **Save**.
4. Trên thanh công cụ, chọn hàm `setupSheets` và bấm **Run**. Google sẽ hỏi quyền (Sheets + Drive), làm như sau:
   - Chọn tài khoản của bạn.
   - Bấm **Advanced > Go to … (unsafe)**. Cảnh báo này hiện ra vì script do chính bạn viết, chưa qua kiểm duyệt của Google.
   - Bấm **Allow**.
5. Quay lại Sheet và tải lại trang. Lúc này sẽ có 7 sheet kèm dữ liệu mẫu và menu **Leeming** trên thanh công cụ.
6. Chọn **Leeming > Chạy thử API** để thử luồng gợi ý. Kết quả xem trong Apps Script, mục **Executions**.
7. Deploy:
   - Bấm **Deploy > New deployment**, bấm biểu tượng bánh răng và chọn **Web app**.
   - *Execute as*: **Me**.
   - *Who has access*: **Anyone**. Dữ liệu vẫn được bảo vệ bằng mã truy cập.
   - Bấm **Deploy** và copy **Web app URL** (dạng `https://script.google.com/macros/s/…/exec`).
8. Lấy mã truy cập ở **Leeming > Xem mã truy cập**.
9. Kiểm tra: mở trên trình duyệt link `<Web app URL>?action=bootstrap&token=<mã>`. Nếu thấy JSON có `"ok":true` là xong.

> **Mỗi lần sửa code** phải vào **Deploy > Manage deployments > Edit > Version: New version > Deploy** thì bản mới mới có hiệu lực. URL giữ nguyên.

**Hai thông tin cần giữ lại cho bước frontend: Web app URL và mã truy cập.**

## 2. Các sheet

| Sheet | Nội dung | Ghi chú |
|---|---|---|
| **Restaurants** | Quán: tên, phân loại, địa chỉ, `lat`/`lng`, `open_time`/`close_time`, `open_days`, giá, service, rating, comment | Xóa mềm (cột `deleted`) |
| **Dishes** | Món + các cột checkbox thuộc tính: cay, ngot, chua, beo, man, nuoc, kho, nong, an_no, an_vat | **Thêm thuộc tính mới = thêm cột mới**, backend tự nhận |
| **RestaurantDishes** | Quán nào bán món nào, giá và điểm riêng của món tại quán đó | |
| **Questions** | Câu hỏi A/B và luật lọc món | Tắt câu hỏi bằng cách bỏ tick `active` |
| **Sessions** | Mỗi lần hỏi: các câu trả lời, các món bị "Hông chịu", kết quả | Dùng cho thống kê |
| **Meals** | Kỷ niệm: ngày, quán, món, sao, khẩu vị, cảm nhận, ảnh | |
| **Config** | `bot_name`, `user_name`, `home_lat`/`home_lng`, `birthday_message`… | |

**Nhập liệu tay trực tiếp trên Sheet:**
- Ô ID để trống: backend chỉ tự tạo ID khi thêm qua API. Nếu nhập tay, tự đặt ID không trùng, ví dụ `R-001`, `D-001`.
- **Giờ mở cửa**: `07:00`, `22:30`. Quán mở qua đêm ghi `18:00` → `02:00`.
- **Ngày mở cửa**: để trống nghĩa là mở cả tuần. Ví dụ: `T2-T6`, `T7,CN`, `T2,T4,T6`.
- **Tọa độ**: mở Google Maps, nhấn giữ vào quán, copy hai con số hiện ra rồi điền vào `lat` và `lng`.
- **Luật câu hỏi**: `thuoc_tinh=TRUE` hoặc `FALSE`, nhiều điều kiện thì nối bằng `;`. Ví dụ: `nuoc=TRUE;nong=TRUE`.

Ba quán mẫu có tiền tố `[Mẫu]`, nhớ thay bằng quán thật của hai bạn.

## 3. Cách hoạt động của gợi ý

**Gợi ý món**
- Lọc các món thỏa **tất cả** câu trả lời trong phiên và bỏ các món đã "Hông chịu".
- **Ưu tiên món đang có quán mở cửa**, để tránh gợi ý món mà giờ đó không quán nào bán.
- Nếu không còn món nào, bỏ dần điều kiện **cũ nhất** và báo lại trong `relaxed`.
- Chọn ngẫu nhiên có trọng số: món được chấm điểm cao thì dễ ra hơn, món ăn trong 14 ngày gần đây thì khó ra hơn.

**Câu hỏi tiếp theo**: chọn câu chia danh sách món còn lại thành hai nửa đều nhất, để mỗi câu trả lời loại được nhiều món nhất.

**Gợi ý quán**
- Chỉ lấy quán bán món đó và **đang mở** (theo giờ Việt Nam, có hỗ trợ quán mở qua đêm).
- Tính khoảng cách từ vị trí điện thoại. Nếu không lấy được vị trí thì dùng `home_lat`/`home_lng`.
- Gắn nhãn `is_best` (điểm cao nhất) và `is_nearest` (gần nhất).
- Điểm "Ngon nhất" lấy theo thứ tự ưu tiên: điểm món tại quán → điểm trung bình các bữa đã ăn → rating nhập tay.

## 4. API

Gọi bằng **POST** tới Web app URL với `Content-Type: text/plain` (để tránh lỗi CORS):

```js
const res = await fetch(API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({ token: API_TOKEN, action: 'suggestDish', payload: { answers, rejected } })
});
const { ok, data, error } = await res.json();
```

Các action chỉ đọc (đánh dấu ✓ ở cột GET) gọi được bằng GET: `?action=...&token=...&payload=<JSON đã encodeURIComponent>`.

| Action | GET | Payload | Trả về |
|---|---|---|---|
| `ping` | ✓ | — | Tên app, giờ server (không cần token) |
| `bootstrap` | ✓ | — | Toàn bộ quán, món, liên kết, câu hỏi, config, kèm `times_eaten`, `last_eaten`, `avg_rating`, `score`… |
| `nextQuestion` | ✓ | `{answers, rejected}` | `{question}` (`null` khi hết câu hỏi) |
| `suggestDish` | ✓ | `{answers:[{question_id, choice:'A'\|'B'}], rejected:[dish_id]}` | `{dish, candidates, relaxed, exhausted}` |
| `suggestRestaurants` | ✓ | `{dish_id, lat?, lng?}` | `{dish, open:[…is_best, is_nearest, distance_km, maps_link], closed, location_source}` |
| `getMeals` | ✓ | `{from?, to?, limit?}` | Danh sách bữa ăn, mới nhất trước |
| `getStats` | ✓ | `{month?:'2026-10', tasteDays?:14}` | `totalMeals`, `newPlaces`, `avgRejects`, `topDishes`, `tasteProfile`, `feltTastes`, `byWeekday`, `photos`, `availableMonths` |
| `create` | | `{table, data}` | Bản ghi mới |
| `update` | | `{table, id, data}` | Bản ghi sau khi sửa |
| `remove` | | `{table, id}` | Xóa (quán, món, bữa ăn là xóa mềm) |
| `linkDishes` | | `{restaurant_id, dishes:[{dish_id, price, dish_rating}]}` | Gán lại toàn bộ món của quán |
| `saveSession` | | `{session:{id?, answers, rejected, final_dish_id, outcome}}` | Tạo mới hoặc cập nhật phiên |
| `saveMeal` | | `{meal:{…}, photo?:{base64, mimeType}, newRestaurant?:{…}}` | Bữa ăn đã lưu (tự tải ảnh lên Drive) |

- `table` của create/update/remove nhận: `restaurants`, `dishes`, `restaurantDishes`, `questions`, `meals`.
- `outcome` của phiên nhận: `di_luon`, `tu_tim`, `bo_do`.

**Luồng chuẩn của frontend:**
1. Mở app: gọi `bootstrap`.
2. Bấm "Hỏi Leeming đi": gọi `saveSession` để tạo phiên, rồi `nextQuestion`.
3. Cá chọn A/B: gọi `suggestDish`.
4. "Hông chịu": thêm món vào `rejected`, quay lại `nextQuestion`.
5. "Đi luôn": gọi `suggestRestaurants`.
6. Chọn quán: gọi `saveMeal` với `source:'suggested'` và `session_id`.
7. "Để bố tự tìm": gọi `saveMeal` với `source:'self'`, kèm `newRestaurant` nếu là quán mới.

## 5. Lưu ý

- **Ảnh**: nên nén ở điện thoại xuống khoảng 1280px trước khi gửi (frontend sẽ làm việc này). Ảnh lưu trong folder Drive `Chìu ông hông bíc ăn gì - Ảnh kỷ niệm` và đặt chế độ *ai có link mới xem được*, để app hiển thị được ảnh.
- **Mã truy cập**: nếu lỡ lộ, chọn **Leeming > Tạo lại mã truy cập** rồi cập nhật mã mới vào frontend.
- **Tốc độ**: mỗi lần gọi mất khoảng 1–2 giây. Frontend nên gọi `bootstrap` một lần lúc mở app, rồi chạy logic gợi ý ngay trên máy cho mượt. Các hàm trong phần "LOGIC GỢI Ý" của `Code.gs` không đụng tới Sheet, nên có thể chép nguyên sang frontend.
