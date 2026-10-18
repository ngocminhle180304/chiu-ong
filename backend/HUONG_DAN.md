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
5. Quay lại Sheet và tải lại trang. Lúc này sẽ có 8 sheet kèm dữ liệu mẫu và menu **Leeming** trên thanh công cụ.
6. Chọn **Leeming > Chạy thử API** để thử luồng gợi ý. Kết quả xem trong Apps Script, mục **Executions**.
7. Deploy:
   - Bấm **Deploy > New deployment**, bấm biểu tượng bánh răng và chọn **Web app**.
   - *Execute as*: **Me**.
   - *Who has access*: **Anyone**. Dữ liệu vẫn được bảo vệ bằng mã truy cập.
   - Bấm **Deploy** và copy **Web app URL** (dạng `https://script.google.com/macros/s/…/exec`).
8. Lấy mã truy cập ở **Leeming > Xem mã truy cập**.
9. Kiểm tra: mở trên trình duyệt link `<Web app URL>?action=bootstrap&token=<mã>`. Nếu thấy JSON có `"ok":true` là xong.

> **Mỗi lần sửa code** phải vào **Deploy > Manage deployments > Edit > Version: New version > Deploy** thì bản mới mới có hiệu lực. URL giữ nguyên.

### Nâng cấp từ bản cũ lên V2

Sheet đang chạy bản cũ (chưa có sheet **Categories**, quán còn ô `rating` nhập tay) thì làm theo thứ tự:

1. **Sao lưu**: *File > Make a copy* để có bản dự phòng.
2. Trong Apps Script, xóa code cũ, dán toàn bộ `Code.gs` mới, bấm **Save**.
3. Chạy `setupSheets`: thêm sheet **Categories** và các cột còn thiếu. Dữ liệu cũ giữ nguyên.
4. Chạy `migrateSchemaV2` (hoặc menu **Leeming > Nâng cấp dữ liệu lên V2**). Hàm này:
   - Tạo danh sách phân loại từ danh sách mặc định cộng với các phân loại đang dùng, rồi đánh lại thứ tự.
   - Đoán thuộc tính mới cho các món cũ (nền ẩm thực, thành phần chính, đồ lạnh, đồ chay) dựa vào tên và phân loại món. Chỉ đoán cho món mà mọi cột mới còn trống.
   - Quán chưa có điểm **Chất lượng** thì lấy `rating` cũ làm Chất lượng, rồi tính lại `rating` cho mọi quán.
   - Chạy lại cũng an toàn: chỉ điền chỗ còn trống.
5. Mở sheet **Dishes** xem lại các thuộc tính đã đoán và sửa chỗ chưa đúng.
6. **Deploy > Manage deployments > Edit > Version: New version > Deploy**.
7. Cập nhật frontend (GitHub) lên bản mới cùng lúc, vì frontend V2 cần các trường mới trong `bootstrap`.

**Hai thông tin cần giữ lại cho bước frontend: Web app URL và mã truy cập.**

## 2. Các sheet

| Sheet | Nội dung | Ghi chú |
|---|---|---|
| **Restaurants** | Quán: tên, phân loại, địa chỉ, `lat`/`lng`, `open_time`/`close_time`, `open_days`, `price_min`/`price_max`, 4 điểm `quality`/`price_score`/`space`/`service`, `rating` (tự tính), comment | Xóa mềm (cột `deleted`) |
| **Dishes** | Món + các cột checkbox thuộc tính (xem bảng dưới) | **Thêm thuộc tính mới = thêm cột mới**, backend tự nhận và xếp vào nhóm "Khác" |
| **Categories** | Phân loại cố định: `type` (`restaurant` / `dish`), `name`, `sort_order` | Quán/món chỉ được dùng phân loại có trong đây |
| **RestaurantDishes** | Quán nào bán món nào, giá và điểm riêng của món tại quán đó | |
| **Questions** | Câu hỏi A/B và luật lọc món | Tắt câu hỏi bằng cách bỏ tick `active` |
| **Sessions** | Mỗi lần hỏi: các câu trả lời, các món bị "Hông chịu", kết quả | Dùng cho thống kê |
| **Meals** | Kỷ niệm: ngày, quán, món, sao, khẩu vị, cảm nhận, ảnh | |
| **Config** | `bot_name`, `user_name`, `home_lat`/`home_lng`, `birthday_message`… | |

**Thuộc tính món (sheet Dishes):**

| Nhóm | Cột → nhãn |
|---|---|
| Vị | `cay` Cay · `ngot` Ngọt · `chua` Chua · `beo` Béo · `man` Mặn |
| Dạng món | `nuoc` Có nước · `kho` Khô · `nong` Đồ nóng · `lanh` Đồ lạnh · `an_no` Ăn là no · `an_vat` Vặt vãnh |
| Nền ẩm thực | `chay` Đồ chay · `do_viet` Đồ Việt · `do_trung` Đồ Trung · `do_au` Đồ Âu · `do_nhat` Đồ Nhật · `do_thai` Đồ Thái · `do_han` Đồ Hàn |
| Thành phần chính | `tp_bo` Bò · `tp_ga` Gà · `tp_vit` Vịt · `tp_ngan` Ngan · `tp_lon` Lợn · `tp_ca` Cá · `tp_haisan` Hải sản · `tp_trung` Trứng |

Thống kê "khẩu vị" chỉ tính hai nhóm **Vị** và **Dạng món**.

**Điểm quán:** 4 tiêu chí thang 0–5: `quality` (Chất lượng), `price_score` (Giá), `space` (Không gian), `service` (Phục vụ). Đừng nhầm `price_score` với `price_min`/`price_max` (khoảng giá tiền thật, VNĐ). Cột `rating` do backend tự tính mỗi lần thêm/sửa quán qua API:

```
rating = 0.5·quality + 0.2·service + 0.2·price_score + 0.1·space
```

Thiếu tiêu chí nào thì chia lại trọng số theo các tiêu chí còn lại, làm tròn 2 chữ số. Ví dụ chỉ có Chất lượng = 4 thì `rating` = 4. Nếu sửa điểm thẳng trên Sheet, chạy lại `migrateSchemaV2` để tính lại `rating`.

**Nhập liệu tay trực tiếp trên Sheet:**
- Ô ID để trống: backend chỉ tự tạo ID khi thêm qua API. Nếu nhập tay, tự đặt ID không trùng, ví dụ `R-001`, `D-001`.
- **Giờ mở cửa**: `07:00`, `22:30`. Quán mở qua đêm ghi `18:00` → `02:00`.
- **Ngày mở cửa**: để trống nghĩa là mở cả tuần. Ví dụ: `T2-T6`, `T7,CN`, `T2,T4,T6`.
- **Tọa độ**: mở Google Maps, nhấn giữ vào quán, copy hai con số hiện ra rồi điền vào `lat` và `lng`.
- **Luật câu hỏi**: `thuoc_tinh=TRUE` hoặc `FALSE`, nhiều điều kiện thì nối bằng `;`. Ví dụ: `nuoc=TRUE;nong=TRUE`, `nong=TRUE` / `lanh=TRUE`, `do_viet=TRUE` / `do_viet=FALSE`.
- **Phân loại**: thêm, đổi tên, xóa nên làm trong app (Cài đặt > Phân loại quán & món). Làm vậy thì đổi tên sẽ tự đổi theo ở mọi quán/món. Nếu sửa tay trên sheet Categories, nhớ sửa luôn cột `category` của quán/món đang dùng.

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
- Điểm "Ngon nhất" lấy theo thứ tự ưu tiên: điểm món tại quán → điểm trung bình các bữa đã ăn → `rating` (điểm chung từ 4 tiêu chí).

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
| `bootstrap` | ✓ | — | Toàn bộ quán, món, liên kết, câu hỏi, config, kèm `times_eaten`, `last_eaten`, `avg_rating`, `score`…; `dishAttrs`, `dishAttrGroups`, `categories`, `ratingWeights`, `ratingLabels` |
| `nextQuestion` | ✓ | `{answers, rejected}` | `{question}` (`null` khi hết câu hỏi) |
| `suggestDish` | ✓ | `{answers:[{question_id, choice:'A'\|'B'}], rejected:[dish_id]}` | `{dish, candidates, relaxed, exhausted}` |
| `suggestRestaurants` | ✓ | `{dish_id, lat?, lng?}` | `{dish, open:[…is_best, is_nearest, distance_km, maps_link], closed, location_source}` |
| `getMeals` | ✓ | `{from?, to?, limit?}` | Danh sách bữa ăn, mới nhất trước |
| `getStats` | ✓ | `{month?:'2026-10', tasteDays?:14}` | `totalMeals`, `newPlaces`, `avgRejects`, `topDishes`, `tasteProfile`, `feltTastes`, `byWeekday`, `photos`, `availableMonths` |
| `create` | | `{table, data}` | Bản ghi mới |
| `update` | | `{table, id, data}` | Bản ghi sau khi sửa (categories: kèm `renamed`) |
| `remove` | | `{table, id, reassign_to?}` | Xóa (quán, món, bữa ăn là xóa mềm). Categories: `{moved, moved_to}` |
| `linkDishes` | | `{restaurant_id, dishes:[{dish_id, price, dish_rating}]}` | Gán lại toàn bộ món của quán |
| `saveSession` | | `{session:{id?, answers, rejected, final_dish_id, outcome}}` | Tạo mới hoặc cập nhật phiên |
| `saveMeal` | | `{meal:{…}, photo?:{base64, mimeType}, newRestaurant?:{…}}` | Bữa ăn đã lưu (tự tải ảnh lên Drive) |

- `table` của create/update/remove nhận: `restaurants`, `dishes`, `restaurantDishes`, `questions`, `meals`, `categories`.
- Quán/món: `category` phải có trong sheet Categories cùng `type`, nếu không sẽ báo lỗi (danh sách trống thì bỏ qua kiểm tra). Quán: không nhận `rating` gửi lên, backend tự tính; điểm tiêu chí ngoài 0–5 bị từ chối.
- **Categories**:
  - `create {type, name, sort_order?}`: không trùng tên trong cùng `type` (không phân biệt hoa thường). `sort_order` mặc định là lớn nhất + 1.
  - `update {id, data:{name?, sort_order?}}`: đổi tên thì đổi luôn `category` ở mọi quán/món đang dùng tên cũ, trả về số dòng đã đổi trong `renamed`.
  - `remove {id, reassign_to?}`: còn quán/món đang dùng thì bắt buộc có `reassign_to` (tên phân loại khác cùng `type`), không có sẽ báo lỗi kèm số lượng đang dùng.
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
