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

### Cập nhật bản "Gợi ý theo ngữ cảnh" (thời tiết · tâm trạng · dịp · vị trí)

Sheet đang dùng thì làm theo thứ tự (không mất dữ liệu cũ):

1. **Sao lưu**: *File > Make a copy*.
2. Dán toàn bộ `Code.gs` mới vào Apps Script, bấm **Save**. Bản trong Apps Script phải **giống hệt** `backend/Code.gs` trên GitHub.
3. Chạy lại `setupSheets` (menu **Leeming > Khởi tạo / bổ sung sheet**). Hàm này:
   - Tạo sheet **ContextRules** kèm luật mẫu (chỉ khi sheet còn trống).
   - Thêm cột `context` vào **Sessions**, `context_tags` và `weather_temp` vào **Meals**.
   - Thêm các khóa Config mới (`context_strength`, `temp_cold_max`…) mà không đổi giá trị đã có.
4. Mở **ContextRules**, điền `date` cho dòng **Sinh nhật Cá** và **Ngày kỷ niệm** (dạng `MM-DD`, ví dụ `07-15`).
5. **Deploy > Manage deployments > Edit > Version: New version > Deploy**.
6. (Tùy chọn) **Leeming > Chạy thử API**: phần cuối log in kết quả Gợi ý nhanh cho 3 kịch bản (mưa + mệt; nóng oi + khuya; 20/10) và phân bố món sau 500 lần chọn.

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
| **ContextRules** | Luật ngữ cảnh: thời tiết, buổi trong ngày, tâm trạng, dịp đặc biệt (xem mục 3) | Chỉ sửa trong Sheet. Tắt luật bằng cách bỏ tick `active` |
| **Config** | `bot_name`, `user_name`, `home_lat`/`home_lng`, `birthday_message`, các khóa ngữ cảnh (xem mục 3)… | |

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
  - Sheet để ngôn ngữ **Tiếng Việt** coi dấu chấm là dấu phân cách hàng nghìn, nên gõ `21.028` sẽ thành số `21028` và khoảng cách tính ra hàng nghìn km. Cách tránh: thêm dấu `'` phía trước (`'21.028`), hoặc nhập qua app, hoặc đổi *File > Settings > Locale* sang *United States*.
  - Backend tự nhận ra và sửa khi đọc các lỗi hay gặp: số bị nhân 1000, lat/lng đảo chỗ, dấu phẩy thập phân, dán cả cặp "lat, lng" vào một ô. Muốn sửa luôn trong Sheet thì chọn **Leeming > Kiểm tra & sửa tọa độ quán**: menu này ghi lại tọa độ đúng và liệt kê các quán không tự sửa được để bạn điền lại tay.
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

### Gợi ý theo ngữ cảnh

Ngữ cảnh chỉ **làm nghiêng** cơ hội ra món, không loại món nào: trời mưa thì món có nước, nóng dễ ra hơn, nhưng món khô vẫn có thể ra. Câu hỏi A/B vẫn lọc cứng như cũ. Không có ngữ cảnh nào (không vị trí điện thoại, không thời tiết, không tâm trạng, không dịp) thì luồng A/B chạy y như trước.

**Các loại ngữ cảnh** (cột `type` trong ContextRules):

| type | Lấy từ đâu |
|---|---|
| `weather` | App lấy thời tiết theo vị trí qua Open-Meteo (miễn phí, không cần key). `rain` khi đang mưa, khả năng mưa ≥ `rain_prob_min` trong ~2 giờ tới hoặc mã thời tiết là mưa/dông. Thêm đúng một mức nhiệt: `cold` (≤ `temp_cold_max`), `cool` (≤ `temp_cool_max`), `hot` / `hot_humid` (≥ `temp_hot_min`; oi khi độ ẩm ≥ `humid_min` hoặc cảm giác ≥ 36°C). Khoảng giữa mát và nóng thì không có nhãn. Cá đổi tay được trên app. |
| `time` | Giờ Việt Nam: `morning` 5–10h, `noon` 10–14h, `afternoon` 14–17h, `evening` 17–22h, `late_night` còn lại. Ở luồng A/B, giờ chỉ được tính khi đã có ngữ cảnh khác. |
| `mood` | Cá chọn trên app, tối đa 2. Hết hạn sau trong ngày. |
| `occasion` | Tự bật khi cột `date` khớp hôm nay (± `occasion_window_days`), hoặc Cá chọn tay. `date` dạng `MM-DD` (lặp hằng năm) hoặc `yyyy-MM-dd` (một lần); để trống là chỉ chọn tay. |

**Cách viết luật** (cột `rule`): `thuoc_tinh=so;thuoc_tinh=so`, ví dụ `nuoc=2;nong=2;cay=1`. Số dương làm món có thuộc tính đó dễ ra hơn, số âm làm khó ra hơn. Thuộc tính không có trong sheet Dishes thì bỏ qua.
- `price_bias`: `1` ưu tiên món/quán xịn hơn (đắt hơn, điểm cao hơn), `-1` ưu tiên tiết kiệm, `0` không ảnh hưởng.
- `novelty_bias`: `1` ưu tiên món ít hoặc chưa ăn.
- `message`: câu Leeming nói ở mục "Vì sao Leeming chọn món này?". Chỉ hiện khi món khớp phần lớn luật đó; dịp đặc biệt thì luôn hiện.
- `emoji`, `label`: hiện trên chip của app. `sort_order`: thứ tự chip.

**Cách tính**: điểm ngữ cảnh của một món là tổng trọng số các luật đang áp dụng mà món khớp, kẹp mềm về khoảng (−4, 4), cộng phần giá, phần mới lạ và phần học từ lịch sử. Trọng số random của món được nhân với `exp(context_strength × điểm)` (giới hạn 0,2–5 lần) và hệ số vị trí:
- quán đang mở gần nhất có bán món nằm trong bán kính: `1 − 0,3 × khoảng cách / bán kính`;
- ngoài bán kính: 0,25;
- không rõ tọa độ quán: 0,8;
- chỉ có quán đang đóng: 0,5;
- không có vị trí hoặc bán kính "không giới hạn": 1.

**Học dần** (`learn_enabled`): mỗi ngữ cảnh có ≥ `learn_min_meals` bữa trong Meals thì app so tỉ lệ thuộc tính món ăn trong ngữ cảnh đó với bình thường, rồi cộng thêm hệ số `log2(tỉ lệ) × learn_strength` (giới hạn ±1,5). Phần này không ghi đè luật trong Sheet. Màn Thống kê hiện kết quả ở mục "Leeming nhận ra…".

**Các khóa Config cho ngữ cảnh:**

| key | mặc định | ý nghĩa |
|---|---|---|
| `context_strength` | 0.35 | Mức nghiêng: 0.15 nhẹ, 0.35 vừa, 0.6 mạnh |
| `temp_cold_max` / `temp_cool_max` / `temp_hot_min` | 18 / 25 / 30 | Ngưỡng nhiệt độ (°C) |
| `humid_min` | 70 | Độ ẩm (%) để tính là nóng oi |
| `rain_prob_min` | 60 | Khả năng mưa (%) để tính là mưa |
| `default_radius_km` | 5 | Bán kính mặc định |
| `learn_enabled` / `learn_strength` / `learn_min_meals` | TRUE / 0.5 / 5 | Học từ lịch sử |
| `occasion_window_days` | 0 | Tự bật dịp khi hôm nay lệch ≤ N ngày |

**Gợi ý nhanh** (`suggestQuick`): không hỏi A/B, chọn món trong mọi món (trừ món đã "Hông chịu"), vẫn ưu tiên món có quán đang mở. Quán được xếp theo `0,6 × điểm + 0,4 × độ gần`; quán ngoài bán kính có `out_of_radius` và xếp cuối.

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
| `nextQuestion` | ✓ | `{answers, rejected, context?}` | `{question}` (`null` khi hết câu hỏi) |
| `suggestDish` | ✓ | `{answers:[{question_id, choice:'A'\|'B'}], rejected:[dish_id], context?}` | `{dish, candidates, relaxed, exhausted, reasons, context}` |
| `suggestRestaurants` | ✓ | `{dish_id, lat?, lng?, context?}` | `{dish, open:[…is_best, is_nearest, distance_km, maps_link, out_of_radius?, match_score?], closed, location_source, radius_km}` |
| `suggestQuick` | ✓ | `{context, rejected?, lat?, lng?, radius_km?, now?, dish_id?}` | `{dish, restaurants:{open, closed, location_source}, reasons, context:{keys, labels, time_bucket…}, alternatives (≤ 2 món), exhausted}` |
| `getMeals` | ✓ | `{from?, to?, limit?}` | Danh sách bữa ăn, mới nhất trước |
| `getStats` | ✓ | `{month?:'2026-10', tasteDays?:14}` | `totalMeals`, `newPlaces`, `avgRejects`, `topDishes`, `tasteProfile`, `feltTastes`, `byWeekday`, `photos`, `availableMonths`, `contextInsights` |
| `create` | | `{table, data}` | Bản ghi mới |
| `update` | | `{table, id, data}` | Bản ghi sau khi sửa (categories: kèm `renamed`) |
| `remove` | | `{table, id, reassign_to?}` | Xóa (quán, món, bữa ăn là xóa mềm). Categories: `{moved, moved_to}` |
| `linkDishes` | | `{restaurant_id, dishes:[{dish_id, price, dish_rating}]}` | Gán lại toàn bộ món của quán |
| `saveSession` | | `{session:{id?, answers, rejected, final_dish_id, outcome, context?}}` | Tạo mới hoặc cập nhật phiên (`context` lưu dạng JSON, không lưu tọa độ) |
| `saveMeal` | | `{meal:{…}, photo?:{base64, mimeType}, newRestaurant?:{…}, context?}` | Bữa ăn đã lưu (tự tải ảnh lên Drive, ghi `context_tags`, `weather_temp`) |

- `table` của create/update/remove nhận: `restaurants`, `dishes`, `restaurantDishes`, `questions`, `meals`, `categories`.
- Quán/món: `category` phải có trong sheet Categories cùng `type`, nếu không sẽ báo lỗi (danh sách trống thì bỏ qua kiểm tra). Quán: không nhận `rating` gửi lên, backend tự tính; điểm tiêu chí ngoài 0–5 bị từ chối.
- **Categories**:
  - `create {type, name, sort_order?}`: không trùng tên trong cùng `type` (không phân biệt hoa thường). `sort_order` mặc định là lớn nhất + 1.
  - `update {id, data:{name?, sort_order?}}`: đổi tên thì đổi luôn `category` ở mọi quán/món đang dùng tên cũ, trả về số dòng đã đổi trong `renamed`.
  - `remove {id, reassign_to?}`: còn quán/món đang dùng thì bắt buộc có `reassign_to` (tên phân loại khác cùng `type`), không có sẽ báo lỗi kèm số lượng đang dùng.
- `outcome` của phiên nhận: `di_luon`, `tu_tim`, `bo_do`.
- **`context`** (tùy chọn, mọi action gợi ý): `{mode:'quick'|'ab', weather:{temp, apparent, humidity, precip, rain_prob, weather_code}, weather_override?:'rain'|'cool'|'cold'|'hot'|'hot_humid'|'none', moods:[key], occasions:[key], occasions_off:[key], lat?, lng?, radius_km?}`. `radius_km`: bỏ trống là dùng `default_radius_km`, `null` là không giới hạn. Không truyền `context` thì gợi ý chạy y như cũ.
- `saveMeal` lấy `context_tags` theo thứ tự: `meal.context_tags` → `context` gửi kèm (bản thô thì backend tự suy ra) → `context` của phiên `session_id`.

**Luồng chuẩn của frontend:**
0. "Gợi ý nhanh ⚡": lấy vị trí + thời tiết rồi gọi `suggestQuick`; "Hông chịu" thì thêm vào `rejected` và gọi lại; chọn quán thì `saveSession` (`context`) rồi `saveMeal`.
1. Mở app: gọi `bootstrap`.
2. Bấm "Hỏi Leeming đi": gọi `saveSession` để tạo phiên, rồi `nextQuestion`.
3. Cá chọn A/B: gọi `suggestDish`.
4. "Hông chịu": thêm món vào `rejected`, quay lại `nextQuestion`.
5. "Đi luôn": gọi `suggestRestaurants`.
6. Chọn quán: gọi `saveMeal` với `source:'suggested'` và `session_id`.
7. "Để bố tự tìm": gọi `saveMeal` với `source:'self'`, kèm `newRestaurant` nếu là quán mới.

## 5. Lưu ý

- **Ảnh**: nên nén ở điện thoại xuống khoảng 1280px trước khi gửi (frontend sẽ làm việc này). Ảnh lưu trong folder Drive `Chìu ông hông bíc ăn gì - Ảnh kỷ niệm` và đặt chế độ *ai có link mới xem được*, để app hiển thị được ảnh.
- **Dịch vụ ngoài**: thời tiết (Open-Meteo) và quán quanh đây (OpenStreetMap/Overpass) do **trình duyệt** gọi trực tiếp, không cần key, tọa độ làm tròn 2 chữ số (~1 km). Lỗi mạng thì app bỏ qua phần đó, không báo lỗi.
- **Mã truy cập**: nếu lỡ lộ, chọn **Leeming > Tạo lại mã truy cập** rồi cập nhật mã mới vào frontend.
- **Tốc độ**: mỗi lần gọi mất khoảng 1–2 giây. Frontend nên gọi `bootstrap` một lần lúc mở app, rồi chạy logic gợi ý ngay trên máy cho mượt. Các hàm trong phần "LOGIC GỢI Ý" của `Code.gs` không đụng tới Sheet, nên có thể chép nguyên sang frontend.
