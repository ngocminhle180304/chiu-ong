/**
 * ============================================================
 *  Chìu ông hông bíc ăn gì — Backend (Google Apps Script)
 *  App: Leeming · Người dùng: Cá
 * ------------------------------------------------------------
 *  Cách dùng nhanh:
 *   1. Dán toàn bộ file này vào Extensions > Apps Script của Google Sheet.
 *   2. Chạy hàm setupSheets() một lần (cấp quyền khi được hỏi).
 *   3. Đang dùng bản cũ (V1)? Chạy thêm migrateSchemaV2() một lần để nâng cấp dữ liệu.
 *   4. Deploy > New deployment > Web app (Execute as: Me, Access: Anyone).
 *   5. Lấy mã truy cập ở menu "Leeming" > "Xem mã truy cập".
 * ============================================================
 */

// ───────────────────────── CẤU HÌNH ─────────────────────────

const TZ = 'Asia/Ho_Chi_Minh';

/** Số phiên bản backend: tăng mỗi khi Code.gs đổi API hoặc sheet. App so với Code.gs trên GitHub
 *  để báo khi Web app đang deploy vẫn là bản cũ. (Hàm thay vì const để app đọc được sau khi nạp file.) */
function backendVersion_() { return 13; }

/** Thuộc tính món ăn (mỗi thuộc tính là 1 cột checkbox trong sheet Dishes), chia theo nhóm để hiển thị.
 *  Muốn thêm thuộc tính mới: chỉ cần thêm cột mới vào sheet Dishes, backend tự nhận và xếp vào nhóm "Khác". */
const DISH_ATTR_GROUPS = [
  { key: 'vi', label: 'Vị', attrs: [['cay', 'Cay'], ['ngot', 'Ngọt'], ['chua', 'Chua'], ['beo', 'Béo'], ['man', 'Mặn']] },
  { key: 'dang', label: 'Dạng món', attrs: [['nuoc', 'Có nước'], ['kho', 'Khô'], ['nong', 'Đồ nóng'], ['lanh', 'Đồ lạnh'],
    ['an_no', 'Ăn là no'], ['an_vat', 'Vặt vãnh']] },
  { key: 'nen', label: 'Nền ẩm thực', attrs: [['chay', 'Đồ chay'], ['do_viet', 'Đồ Việt'], ['do_trung', 'Đồ Trung'], ['do_au', 'Đồ Âu'],
    ['do_nhat', 'Đồ Nhật'], ['do_thai', 'Đồ Thái'], ['do_han', 'Đồ Hàn']] },
  { key: 'tp', label: 'Thành phần chính', attrs: [['tp_bo', 'Bò'], ['tp_ga', 'Gà'], ['tp_vit', 'Vịt'], ['tp_ngan', 'Ngan'],
    ['tp_lon', 'Lợn'], ['tp_ca', 'Cá'], ['tp_haisan', 'Hải sản'], ['tp_trung', 'Trứng']] }
];
const DISH_ATTRS = [];
const ATTR_LABELS = {};
DISH_ATTR_GROUPS.forEach((g) => g.attrs.forEach((a) => { DISH_ATTRS.push(a[0]); ATTR_LABELS[a[0]] = a[1]; }));
/** Thống kê "khẩu vị" chỉ tính vị và dạng món. */
const TASTE_ATTRS = DISH_ATTR_GROUPS.filter((g) => g.key === 'vi' || g.key === 'dang')
  .reduce((out, g) => out.concat(g.attrs.map((a) => a[0])), []);
/** Thuộc tính thêm ở V2 — migrateSchemaV2() tự đoán giá trị cho món cũ. */
const V2_DISH_ATTRS = ['lanh', 'chay', 'do_viet', 'do_trung', 'do_au', 'do_nhat', 'do_thai', 'do_han',
  'tp_bo', 'tp_ga', 'tp_vit', 'tp_ngan', 'tp_lon', 'tp_ca', 'tp_haisan', 'tp_trung'];
const DISH_BASE_COLS = ['id', 'name', 'category', 'image_url', 'note', 'created_at', 'updated_at', 'deleted'];

/** Điểm chung của quán = trung bình có trọng số của 4 tiêu chí (thang 0–5). Thiếu tiêu chí nào thì chia lại trọng số. */
const RATING_WEIGHTS = { quality: 0.5, service: 0.2, price_score: 0.2, space: 0.1 };
const RATING_LABELS = { quality: 'Chất lượng', price_score: 'Giá', space: 'Không gian', service: 'Phục vụ' };

/** Phân loại mặc định (dùng chung cho quán và món; món có thêm "Đồ uống"). */
const DEFAULT_CATEGORIES = ['Bún/Phở', 'Cơm', 'Mì', 'Bánh', 'Cháo', 'Lẩu', 'Nướng', 'Ăn vặt', 'Gà rán', 'Đồ Âu', 'Đồ Nhật',
  'Đồ Hàn', 'Đồ Thái', 'Đồ Hoa', 'Ốc', 'Nhậu', 'Buffet', 'Cuốn', 'Tráng miệng', 'Cà phê', 'Cà phê mèo', 'Trà sữa', 'Pub/Bar'];
const CATEGORY_TYPES = { restaurant: 'restaurants', dish: 'dishes' };

/** Khóa Config mặc định. ensureConfigKeys_() thêm khóa còn thiếu khi chạy setupSheets (không ghi đè giá trị đã có). */
const CONFIG_DEFAULTS = [
  ['app_name', 'Chìu ông hông bíc ăn gì', 'Tên app'],
  ['bot_name', 'Leeming', 'App tự xưng'],
  ['user_name', 'Cá', 'Cách app gọi người dùng'],
  ['home_lat', '', 'Vĩ độ nhà — dùng khi không lấy được vị trí điện thoại'],
  ['home_lng', '', 'Kinh độ nhà'],
  ['birthday_message', '', 'Lời chúc hiện ở màn hình chào'],
  ['photo_folder_id', '', 'Tự điền khi lưu ảnh đầu tiên'],
  ['context_strength', '0.35', 'Mức ngữ cảnh làm nghiêng gợi ý: 0.15 nhẹ, 0.35 vừa, 0.6 mạnh'],
  ['temp_cold_max', '18', 'Nhiệt độ (°C) ≤ giá trị này là "lạnh"'],
  ['temp_cool_max', '25', 'Nhiệt độ ≤ giá trị này (và trên mức lạnh) là "mát"'],
  ['temp_hot_min', '30', 'Nhiệt độ ≥ giá trị này là "nóng"'],
  ['humid_min', '70', 'Nóng + độ ẩm (%) ≥ giá trị này (hoặc cảm giác ≥ 36°C) là "nóng oi"'],
  ['rain_prob_min', '60', 'Xác suất mưa (%) trong ~2 giờ tới để tính là "mưa"'],
  ['default_radius_km', '5', 'Bán kính tìm quán mặc định (km)'],
  ['learn_enabled', 'TRUE', 'Học dần từ lịch sử ăn theo ngữ cảnh'],
  ['learn_strength', '0.5', 'Hệ số học'],
  ['learn_min_meals', '5', 'Số bữa tối thiểu của 1 ngữ cảnh mới bắt đầu học'],
  ['occasion_window_days', '0', 'Tự bật dịp đặc biệt khi hôm nay lệch ≤ N ngày']
];
const CONTEXT_TYPES = ['weather', 'time', 'mood', 'occasion'];
const WEATHER_KEYS = ['rain', 'cold', 'cool', 'hot', 'hot_humid'];

const TABLES = {
  restaurants: {
    sheet: 'Restaurants', prefix: 'R', soft: true,
    headers: ['id', 'name', 'category', 'address', 'lat', 'lng', 'open_time', 'close_time', 'open_days',
      'price_min', 'price_max', 'quality', 'price_score', 'space', 'service', 'rating', 'comment', 'maps_url',
      'created_at', 'updated_at', 'deleted'],
    num: ['lat', 'lng', 'price_min', 'price_max', 'quality', 'price_score', 'space', 'service', 'rating'],
    bool: ['deleted']
  },
  dishes: {
    sheet: 'Dishes', prefix: 'D', soft: true,
    headers: ['id', 'name', 'category', 'image_url', 'note'].concat(DISH_ATTRS, ['created_at', 'updated_at', 'deleted']),
    num: [],
    bool: ['deleted'] // + các cột thuộc tính, phát hiện tự động
  },
  restaurantDishes: {
    sheet: 'RestaurantDishes', prefix: 'RD', soft: false,
    headers: ['id', 'restaurant_id', 'dish_id', 'price', 'dish_rating', 'note', 'created_at', 'updated_at'],
    num: ['price', 'dish_rating'],
    bool: []
  },
  questions: {
    sheet: 'Questions', prefix: 'Q', soft: false,
    headers: ['id', 'sort_order', 'text', 'option_a', 'rule_a', 'option_b', 'rule_b', 'active', 'created_at', 'updated_at'],
    num: ['sort_order'],
    bool: ['active']
  },
  sessions: {
    sheet: 'Sessions', prefix: 'S', soft: false,
    headers: ['id', 'started_at', 'ended_at', 'answers', 'rejected', 'final_dish_id', 'final_restaurant_id', 'outcome',
      'context', 'created_at', 'updated_at'],
    num: [],
    bool: []
  },
  meals: {
    sheet: 'Meals', prefix: 'M', soft: true,
    headers: ['id', 'date', 'session_id', 'source', 'restaurant_id', 'restaurant_name', 'dish_id', 'dish_name', 'rating',
      'tastes', 'feeling', 'photo_url', 'photo_file_id', 'is_new_place', 'context_tags', 'weather_temp',
      'quality', 'price_score', 'space', 'service', 'created_at', 'updated_at', 'deleted'],
    num: ['rating', 'weather_temp', 'quality', 'price_score', 'space', 'service'],
    bool: ['is_new_place', 'deleted']
  },
  categories: {
    sheet: 'Categories', prefix: 'C', soft: false,
    headers: ['id', 'type', 'name', 'sort_order', 'created_at', 'updated_at'],
    num: ['sort_order'],
    bool: []
  },
  mealDishes: {
    sheet: 'MealDishes', prefix: 'MD', soft: false,
    headers: ['id', 'meal_id', 'dish_id', 'dish_name', 'rating', 'note', 'created_at', 'updated_at'],
    num: ['rating'],
    bool: []
  },
  contextRules: {
    sheet: 'ContextRules', prefix: 'CR', soft: false,
    headers: ['id', 'type', 'key', 'label', 'emoji', 'rule', 'price_bias', 'novelty_bias', 'message', 'date', 'active',
      'sort_order', 'created_at', 'updated_at'],
    num: ['price_bias', 'novelty_bias', 'sort_order'],
    bool: ['active']
  },
  config: {
    sheet: 'Config', prefix: '', soft: false,
    headers: ['key', 'value', 'note'],
    num: [],
    bool: []
  }
};

/** Các bảng frontend được phép thêm/sửa/xóa trực tiếp. */
const CRUD_TABLES = ['restaurants', 'dishes', 'restaurantDishes', 'questions', 'meals', 'categories'];
const READONLY_COLS = ['id', 'created_at', 'updated_at'];
const PHOTO_FOLDER_NAME = 'Chìu ông hông bíc ăn gì - Ảnh kỷ niệm';

// ───────────────────────── API ─────────────────────────

const ACTIONS = {
  ping: () => ({ app: getConfigValue_('app_name') || 'Chìu ông hông bíc ăn gì', time: nowIso_(), backendVersion: backendVersion_() }),
  bootstrap: () => bootstrap_(),
  create: (p) => { assertCrud_(p.table); return withLock_(() => createRecord_(p.table, p.data || {})); },
  update: (p) => { assertCrud_(p.table); return withLock_(() => updateRecord_(p.table, p.id, p.data || {})); },
  remove: (p) => { assertCrud_(p.table); return withLock_(() => removeRecord_(p.table, p.id, p)); },
  linkDishes: (p) => withLock_(() => linkDishes_(p)),
  nextQuestion: (p) => nextQuestion_(bootstrap_(), p),
  suggestDish: (p) => suggestDish_(bootstrap_(), p),
  suggestRestaurants: (p) => suggestRestaurants_(bootstrap_(), p),
  suggestQuick: (p) => suggestQuick_(bootstrap_(), p),
  saveSession: (p) => withLock_(() => saveSession_(p.session || p)),
  saveMeal: (p) => withLock_(() => saveMeal_(p)),
  getMeals: (p) => getMeals_(p),
  getStats: (p) => getStats_(p),
  resolveMapLink: (p) => resolveMapLink_(p.url)
};

/** Action chỉ đọc — được phép gọi bằng GET (tiện để test trên trình duyệt). */
const READ_ACTIONS = ['ping', 'bootstrap', 'nextQuestion', 'suggestDish', 'suggestRestaurants', 'suggestQuick', 'getMeals', 'getStats', 'resolveMapLink'];

function doGet(e) {
  const p = (e && e.parameter) || {};
  let payload = {};
  try { payload = p.payload ? JSON.parse(p.payload) : {}; } catch (err) { return json_({ ok: false, error: 'payload không phải JSON hợp lệ' }); }
  return route_(p.action || 'ping', p.token, payload, true);
}

/** Frontend nên gửi Content-Type: text/plain để tránh lỗi CORS preflight.
 *  Body: {"token":"...","action":"...","payload":{...}} */
function doPost(e) {
  let body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {
    return json_({ ok: false, error: 'Body không phải JSON hợp lệ' });
  }
  return route_(body.action, body.token, body.payload || {}, false);
}

function route_(action, token, payload, isGet) {
  try {
    if (!action || !ACTIONS[action]) throw new Error('Không có action: ' + action);
    if (action !== 'ping') checkToken_(token);
    if (isGet && READ_ACTIONS.indexOf(action) < 0) throw new Error('Action ghi dữ liệu phải gọi bằng POST');
    return json_({ ok: true, data: ACTIONS[action](payload || {}) });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!expected) throw new Error('Chưa có mã truy cập. Hãy chạy setupSheets().');
  if (!token || String(token) !== expected) throw new Error('Sai mã truy cập');
}

function assertCrud_(table) {
  if (CRUD_TABLES.indexOf(table) < 0) throw new Error('Bảng không hợp lệ: ' + table);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ───────────────────────── TRUY CẬP SHEET ─────────────────────────

function sheet_(table) {
  const def = TABLES[table];
  const sh = SpreadsheetApp.getActive().getSheetByName(def.sheet);
  if (!sh) throw new Error('Thiếu sheet "' + def.sheet + '". Hãy chạy setupSheets().');
  return sh;
}

function headersOf_(sh) {
  const lastCol = sh.getLastColumn();
  if (lastCol < 1) return [];
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].map((h) => String(h).trim());
}

function dishAttrs_(headers) {
  return headers.filter((h) => h && DISH_BASE_COLS.indexOf(h) < 0);
}

function boolCols_(table, headers) {
  const def = TABLES[table];
  return table === 'dishes' ? def.bool.concat(dishAttrs_(headers)) : def.bool;
}

function toBool_(v) {
  if (v === true || v === false) return v;
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'x' || s === 'yes' || s === 'có';
}

/** Cột điểm thang 0–5. Sheet tiếng Việt hay tự đổi "4.5" thành ngày 4/5: đọc lại thành 4.5. */
const SCORE_COLS = ['quality', 'price_score', 'space', 'service', 'rating', 'dish_rating'];

function fromCell_(h, v, boolCols, numCols) {
  if (boolCols.indexOf(h) >= 0) return toBool_(v);
  if (v === '' || v == null) return null;
  if (v instanceof Date && numCols.indexOf(h) >= 0) {
    if (SCORE_COLS.indexOf(h) < 0) return null;
    const d = Number(Utilities.formatDate(v, TZ, 'd')); const m = Number(Utilities.formatDate(v, TZ, 'M'));
    const n = Number(d + '.' + m);
    return d <= 5 && n <= 5 ? n : null;
  }
  if (v instanceof Date) {
    if (h === 'open_time' || h === 'close_time') return Utilities.formatDate(v, TZ, 'HH:mm');
    if (h === 'date') return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
    return Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  if (numCols.indexOf(h) >= 0) { const n = Number(v); return isNaN(n) ? null : n; }
  return v;
}

function toCell_(h, v, boolCols, numCols) {
  if (boolCols.indexOf(h) >= 0) return toBool_(v);
  if (v === undefined || v === null || v === '') return '';
  if (v instanceof Date) return v;
  if (numCols.indexOf(h) >= 0) { const n = Number(v); return isNaN(n) ? '' : n; }
  if (typeof v === 'object') v = JSON.stringify(v);
  // Dấu ' giữ nguyên dạng text (giờ "07:00", ngày, ID...) và chặn chèn công thức.
  return "'" + String(v);
}

function readAll_(table, includeDeleted) {
  const def = TABLES[table];
  const sh = sheet_(table);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map((h) => String(h).trim());
  const bools = boolCols_(table, headers);
  return values.slice(1)
    .filter((r) => r.some((c) => c !== '' && c !== null && c !== false))
    .map((r) => {
      const o = {};
      headers.forEach((h, i) => { if (h) o[h] = fromCell_(h, r[i], bools, def.num); });
      if (table === 'restaurants') { const c = fixLatLng_(o.lat, o.lng); o.lat = c.lat; o.lng = c.lng; }
      if (table === 'categories') { o.type = normCategoryType_(o.type); o.name = o.name == null ? '' : String(o.name).trim(); }
      return o;
    })
    .filter((o) => includeDeleted || !(def.soft && o.deleted === true));
}

function findRow_(sh, id) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function insert_(table, data) {
  const def = TABLES[table];
  const sh = sheet_(table);
  const headers = headersOf_(sh);
  const bools = boolCols_(table, headers);
  const now = nowIso_();
  const row = Object.assign({}, data, { id: newId_(def.prefix), created_at: now, updated_at: now });
  if (def.soft) row.deleted = false;
  if ((table === 'questions' || table === 'contextRules') && row.active === undefined) row.active = true;
  sh.appendRow(headers.map((h) => toCell_(h, row[h], bools, def.num)));
  applyCheckboxes_(sh, sh.getLastRow(), headers, bools);
  return rowToObj_(table, sh, sh.getLastRow(), headers);
}

function update_(table, id, data) {
  if (!id) throw new Error('Thiếu id');
  const def = TABLES[table];
  const sh = sheet_(table);
  const headers = headersOf_(sh);
  const bools = boolCols_(table, headers);
  const r = findRow_(sh, id);
  if (r < 0) throw new Error('Không tìm thấy bản ghi ' + id);
  const current = sh.getRange(r, 1, 1, headers.length).getValues()[0];
  const merged = headers.map((h, i) => {
    if (h === 'updated_at') return toCell_(h, nowIso_(), bools, def.num);
    if (READONLY_COLS.indexOf(h) < 0 && Object.prototype.hasOwnProperty.call(data, h)) return toCell_(h, data[h], bools, def.num);
    const v = current[i];
    if (bools.indexOf(h) >= 0) return toBool_(v);
    return (typeof v === 'string' && v !== '') ? "'" + v : v;
  });
  sh.getRange(r, 1, 1, headers.length).setValues([merged]);
  applyCheckboxes_(sh, r, headers, bools);
  return rowToObj_(table, sh, r, headers);
}

function remove_(table, id) {
  const def = TABLES[table];
  if (def.soft) { update_(table, id, { deleted: true }); return { id: id, deleted: true }; }
  const sh = sheet_(table);
  const r = findRow_(sh, id);
  if (r < 0) throw new Error('Không tìm thấy bản ghi ' + id);
  sh.deleteRow(r);
  return { id: id, deleted: true };
}

function rowToObj_(table, sh, r, headers) {
  const def = TABLES[table];
  const bools = boolCols_(table, headers);
  const vals = sh.getRange(r, 1, 1, headers.length).getValues()[0];
  const o = {};
  headers.forEach((h, i) => { if (h) o[h] = fromCell_(h, vals[i], bools, def.num); });
  return o;
}

function applyCheckboxes_(sh, r, headers, bools) {
  const rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  headers.forEach((h, i) => { if (bools.indexOf(h) >= 0) sh.getRange(r, i + 1).setDataValidation(rule); });
}

/** Gán danh sách món cho 1 quán: {restaurant_id, dishes:[{dish_id, price, dish_rating}]}. Thay thế toàn bộ liên kết cũ. */
function linkDishes_(p) {
  if (!p.restaurant_id) throw new Error('Thiếu restaurant_id');
  const sh = sheet_('restaurantDishes');
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);
  const col = headers.indexOf('restaurant_id');
  for (let r = values.length - 1; r >= 1; r--) {
    if (String(values[r][col]) === String(p.restaurant_id)) sh.deleteRow(r + 1);
  }
  return (p.dishes || []).map((d) => insert_('restaurantDishes', {
    restaurant_id: p.restaurant_id, dish_id: d.dish_id, price: d.price, dish_rating: d.dish_rating, note: d.note
  }));
}

// ───────────────────────── THÊM / SỬA / XÓA CÓ KIỂM TRA ─────────────────────────
// Lớp nằm trên insert_/update_/remove_: kiểm tra phân loại, tự tính điểm quán, xử lý riêng bảng categories.

function findById_(table, id) {
  return readAll_(table, true).filter((x) => String(x.id) === String(id))[0] || null;
}

function createRecord_(table, data) {
  data = Object.assign({}, data);
  if (table === 'categories') return createCategory_(data);
  if (table === 'restaurants' || table === 'dishes') data.category = checkCategory_(table, data.category);
  if (table === 'restaurants') { checkScores_(data); checkLatLng_(data); data.rating = calcRating_(data); }
  return insert_(table, data);
}

function updateRecord_(table, id, data) {
  data = Object.assign({}, data);
  if (table === 'categories') return updateCategory_(id, data);
  if ((table === 'restaurants' || table === 'dishes') && Object.prototype.hasOwnProperty.call(data, 'category')) {
    data.category = checkCategory_(table, data.category);
  }
  if (table === 'restaurants') {
    checkScores_(data);
    checkLatLng_(data);
    const current = findById_('restaurants', id);
    if (!current) throw new Error('Không tìm thấy bản ghi ' + id);
    // Ghép tiêu chí mới với giá trị đang lưu rồi tính lại; rating không cho nhập tay.
    data.rating = calcRating_(Object.assign({}, current, data));
  }
  return update_(table, id, data);
}

function removeRecord_(table, id, p) {
  if (table === 'categories') return removeCategory_(id, p && p.reassign_to);
  return remove_(table, id);
}

// ───────────── TỌA ĐỘ ─────────────
// Sheet để ngôn ngữ Tiếng Việt coi dấu chấm là dấu phân cách hàng nghìn: gõ tay "21.028" sẽ thành số 21028,
// làm khoảng cách tính ra hàng nghìn km. Các hàm dưới tự nhận ra và sửa những lỗi hay gặp.

/** Một giá trị tọa độ -> số (hoặc null). Nhận cả dấu phẩy thập phân "21,0285". */
function coordNum_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).trim().replace(/^'/, '').replace(/\s/g, '');
  if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  const n = Number(s);
  return s !== '' && isFinite(n) ? n : null;
}

/** Số bị nhân 1000 (mỗi lần Sheet nuốt 1 dấu chấm) → chia lại cho tới khi nằm trong giới hạn. */
function unscaleCoord_(n, limit) {
  if (n == null) return null;
  if (Math.abs(n) <= limit) return n;
  let x = n;
  while (Math.abs(x) > limit && Math.abs(x) >= 1000) x = x / 1000;
  return Math.abs(x) <= limit ? Math.round(x * 1e7) / 1e7 : null;
}

/** Chuẩn hóa cặp lat/lng: tách "lat, lng" dán chung 1 ô, sửa số bị nhân 1000, đổi chỗ lat/lng bị đảo.
 *  Trả {lat, lng} — null cả hai nếu không cứu được. */
function fixLatLng_(lat, lng) {
  let a = lat; let b = lng;
  const pair = String(a == null ? '' : a).match(/^\s*'?(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
  if (pair && (b === null || b === undefined || b === '')) { a = pair[1].replace(',', '.'); b = pair[2].replace(',', '.'); }
  let x = coordNum_(a); let y = coordNum_(b);
  if (x == null || y == null) return { lat: null, lng: null };
  // Đảo chỗ: lat ngoài [-90, 90] nhưng lng lại nằm trong đó (ví dụ 105.85, 21.03).
  if (Math.abs(x) > 90 && Math.abs(x) <= 180 && Math.abs(y) <= 90) { const t = x; x = y; y = t; }
  const la = unscaleCoord_(x, 90); const ln = unscaleCoord_(y, 180);
  if (la == null || ln == null) return { lat: null, lng: null };
  return { lat: la, lng: ln };
}

/** Khi thêm/sửa quán qua API: chuẩn hóa tọa độ, nhập sai hẳn thì báo lỗi. */
function checkLatLng_(data) {
  const hasLat = data.lat !== undefined && data.lat !== null && data.lat !== '';
  const hasLng = data.lng !== undefined && data.lng !== null && data.lng !== '';
  if (!hasLat && !hasLng) return;
  const c = fixLatLng_(data.lat, data.lng);
  if (c.lat == null || c.lng == null) throw new Error('Tọa độ chưa đúng. Vĩ độ từ -90 đến 90, kinh độ từ -180 đến 180, ví dụ 21.0285 và 105.8542');
  data.lat = c.lat; data.lng = c.lng;
}

/** Menu "Leeming > Kiểm tra & sửa tọa độ quán": ghi lại tọa độ đã chuẩn hóa vào sheet, liệt kê quán đã sửa
 *  và quán có tọa độ hỏng không tự sửa được. Chạy lại cũng an toàn. */
function fixCoordinates() {
  return withLock_(() => {
    const sh = sheet_('restaurants');
    const headers = headersOf_(sh);
    const li = headers.indexOf('lat'); const gi = headers.indexOf('lng'); const ni = headers.indexOf('name');
    const last = sh.getLastRow();
    const report = { fixed: [], broken: [] };
    if (last >= 2 && li >= 0 && gi >= 0) {
      const range = sh.getRange(2, 1, last - 1, headers.length);
      const values = range.getValues();
      values.forEach((row) => {
        if (row[li] === '' && row[gi] === '') return;
        const c = fixLatLng_(row[li], row[gi]);
        const name = String(row[ni] || '');
        if (c.lat == null) { report.broken.push(name + ' (' + row[li] + ', ' + row[gi] + ')'); return; }
        if (c.lat !== row[li] || c.lng !== row[gi]) {
          report.fixed.push(name + ': ' + row[li] + ', ' + row[gi] + ' → ' + c.lat + ', ' + c.lng);
          row[li] = c.lat; row[gi] = c.lng;
        }
      });
      sh.getRange(2, li + 1, values.length, 1).setValues(values.map((r) => [r[li]]));
      sh.getRange(2, gi + 1, values.length, 1).setValues(values.map((r) => [r[gi]]));
    }
    const cfg = readAll_('config');
    const rawLat = (cfg.filter((r) => r.key === 'home_lat')[0] || {}).value;
    const rawLng = (cfg.filter((r) => r.key === 'home_lng')[0] || {}).value;
    if (rawLat !== undefined && rawLat !== '' && rawLat !== null) {
      const h = fixLatLng_(rawLat, rawLng);
      if (h.lat == null) report.broken.push('Nhà (Config: ' + rawLat + ', ' + rawLng + ')');
      else if (String(h.lat) !== String(rawLat) || String(h.lng) !== String(rawLng)) {
        setConfigValue_('home_lat', String(h.lat)); setConfigValue_('home_lng', String(h.lng));
        report.fixed.push('Nhà (Config): ' + rawLat + ', ' + rawLng + ' → ' + h.lat + ', ' + h.lng);
      }
    }
    const msg = 'Đã sửa ' + report.fixed.length + ' tọa độ' + (report.fixed.length ? ':\n' + report.fixed.join('\n') : '.') +
      (report.broken.length ? '\n\nKhông tự sửa được (điền lại tay):\n' + report.broken.join('\n') : '');
    console.log(msg);
    try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* chạy từ editor */ }
    return report;
  });
}

/** rating = Σ(w·x) / Σw trên các tiêu chí đang có, làm tròn 2 chữ số. Không có tiêu chí nào → null. */
function calcRating_(r) {
  let sum = 0; let w = 0;
  Object.keys(RATING_WEIGHTS).forEach((k) => {
    if (r && isNum_(r[k])) { sum += RATING_WEIGHTS[k] * Number(r[k]); w += RATING_WEIGHTS[k]; }
  });
  return w ? Math.round(sum / w * 100) / 100 : null;
}

function checkScores_(data) {
  Object.keys(RATING_WEIGHTS).forEach((k) => {
    const v = data[k];
    if (v === undefined || v === null || v === '') return;
    const n = Number(v);
    if (isNaN(n) || n < 0 || n > 5) throw new Error('Điểm ' + RATING_LABELS[k] + ' phải từ 0 đến 5');
  });
}

// ───────────────────────── PHÂN LOẠI (CATEGORIES) ─────────────────────────

/** Cột type nhập tay có thể là "Restaurant ", "Quán", "món"… → 'restaurant' | 'dish'. */
function normCategoryType_(t) {
  const s = String(t == null ? '' : t).trim().toLowerCase();
  if (/^(restaurants?|quán|quan|shops?|store)$/.test(s)) return 'restaurant';
  if (/^(dish(es)?|món|mon|foods?)$/.test(s)) return 'dish';
  return s;
}

function categoryTypeOf_(table) { return table === 'restaurants' ? 'restaurant' : 'dish'; }
function typeLabel_(type) { return type === 'restaurant' ? 'quán' : 'món'; }
function lower_(s) { return String(s == null ? '' : s).trim().toLowerCase(); }

function categoriesOf_(type) {
  return readAll_('categories').filter((c) => c.type === type)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

/** Trả về tên phân loại chuẩn (đúng hoa thường như trong danh sách). Danh sách trống thì không kiểm tra. */
function checkCategory_(table, name) {
  const v = String(name == null ? '' : name).trim();
  if (!v) return '';
  const type = categoryTypeOf_(table);
  const list = categoriesOf_(type);
  if (!list.length) return v;
  const hit = list.filter((c) => lower_(c.name) === lower_(v))[0];
  if (!hit) throw new Error('Phân loại "' + v + '" chưa có trong danh sách ' + typeLabel_(type) + '. Thêm ở màn Quản lý phân loại trước nha.');
  return String(hit.name);
}

/** Đếm quán/món (chưa xóa) đang dùng 1 phân loại. */
function categoryUsage_(type, name) {
  return readAll_(CATEGORY_TYPES[type]).filter((x) => lower_(x.category) === lower_(name)).length;
}

/** Đổi cột category của mọi dòng (kể cả dòng đã xóa mềm) từ oldName sang newName. Trả về số dòng đã đổi. */
function moveCategory_(table, oldName, newName) {
  const sh = sheet_(table);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  const col = headersOf_(sh).indexOf('category') + 1;
  if (col < 1) return 0;
  const range = sh.getRange(2, col, lastRow - 1, 1);
  let n = 0;
  const vals = range.getValues().map((r) => {
    if (r[0] !== '' && lower_(r[0]) === lower_(oldName)) { n++; return ["'" + newName]; }
    return [r[0] === '' ? '' : "'" + r[0]];
  });
  if (n) range.setValues(vals);
  return n;
}

function createCategory_(data) {
  const type = String(data.type || '');
  if (!CATEGORY_TYPES[type]) throw new Error('type phải là "restaurant" hoặc "dish"');
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Phân loại phải có tên');
  const list = categoriesOf_(type);
  if (list.some((c) => lower_(c.name) === lower_(name))) throw new Error('Đã có phân loại "' + name + '" cho ' + typeLabel_(type));
  const sortOrder = isNum_(data.sort_order) ? Number(data.sort_order)
    : list.reduce((m, c) => Math.max(m, Number(c.sort_order) || 0), 0) + 1;
  return insert_('categories', { type: type, name: name, sort_order: sortOrder });
}

/** data: {name?, sort_order?}. Đổi tên thì đổi luôn ở mọi quán/món đang dùng tên cũ. */
function updateCategory_(id, data) {
  const cur = findById_('categories', id);
  if (!cur) throw new Error('Không tìm thấy phân loại ' + id);
  const patch = {};
  let renamed = 0;
  if (data.name !== undefined) {
    const name = String(data.name || '').trim();
    if (!name) throw new Error('Phân loại phải có tên');
    if (categoriesOf_(cur.type).some((c) => c.id !== cur.id && lower_(c.name) === lower_(name))) {
      throw new Error('Đã có phân loại "' + name + '" cho ' + typeLabel_(cur.type));
    }
    if (name !== cur.name) renamed = moveCategory_(CATEGORY_TYPES[cur.type], cur.name, name);
    patch.name = name;
  }
  if (data.sort_order !== undefined) {
    if (!isNum_(data.sort_order)) throw new Error('sort_order phải là số');
    patch.sort_order = Number(data.sort_order);
  }
  return Object.assign(update_('categories', id, patch), { renamed: renamed });
}

/** Xóa phân loại. Còn quán/món đang dùng thì bắt buộc có reassign_to (tên phân loại khác cùng type). */
function removeCategory_(id, reassignTo) {
  const cur = findById_('categories', id);
  if (!cur) throw new Error('Không tìm thấy phân loại ' + id);
  const table = CATEGORY_TYPES[cur.type];
  const used = categoryUsage_(cur.type, cur.name);
  let target = String(reassignTo == null ? '' : reassignTo).trim();
  if (target) {
    const hit = categoriesOf_(cur.type).filter((c) => c.id !== cur.id && lower_(c.name) === lower_(target))[0];
    if (!hit) throw new Error('Không có phân loại "' + target + '" để chuyển sang');
    target = String(hit.name);
  } else if (used) {
    throw new Error('Còn ' + used + ' ' + typeLabel_(cur.type) + ' đang dùng "' + cur.name + '". Chọn phân loại khác để chuyển sang trước khi xóa.');
  }
  const moved = target ? moveCategory_(table, cur.name, target) : 0;
  remove_('categories', id);
  return { id: id, deleted: true, moved: moved, moved_to: target || null };
}

/** Menu "Leeming > Đồng bộ danh sách phân loại": chuẩn hóa cột type, thêm phân loại quán/món đang dùng còn thiếu. */
function syncCategories() {
  return withLock_(() => {
    const sh = sheet_('categories');
    const ti = headersOf_(sh).indexOf('type');
    let fixedType = 0;
    if (ti >= 0 && sh.getLastRow() >= 2) {
      const range = sh.getRange(2, ti + 1, sh.getLastRow() - 1, 1);
      const vals = range.getValues().map((r) => {
        const t = normCategoryType_(r[0]);
        if (r[0] !== '' && t !== r[0]) fixedType++;
        return [r[0] === '' ? '' : "'" + t];
      });
      if (fixedType) range.setValues(vals);
    }
    const added = syncCategories_();
    const msg = 'Đã chuẩn hóa ' + fixedType + ' ô type và thêm ' + added + ' phân loại còn thiếu. Hiện có ' +
      categoriesOf_('restaurant').length + ' phân loại quán, ' + categoriesOf_('dish').length + ' phân loại món.';
    console.log(msg);
    try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* chạy từ editor */ }
    return { fixedType: fixedType, added: added };
  });
}

/** Thêm phân loại mặc định + phân loại đang dùng còn thiếu, rồi đánh lại sort_order (giữ thứ tự cũ, cái mới xếp sau). */
function syncCategories_() {
  let added = 0;
  Object.keys(CATEGORY_TYPES).forEach((type) => {
    const defaults = DEFAULT_CATEGORIES.concat(type === 'dish' ? ['Đồ uống'] : []);
    const used = readAll_(CATEGORY_TYPES[type], true).map((x) => String(x.category || '').trim()).filter(Boolean);
    const list = categoriesOf_(type);
    const have = {}; list.forEach((c) => { have[lower_(c.name)] = true; });
    defaults.concat(used).forEach((name) => {
      if (have[lower_(name)]) return;
      have[lower_(name)] = true;
      insert_('categories', { type: type, name: name, sort_order: 0 });
      added++;
    });
    // insert_ đặt sort_order = 0 cho cái mới; xếp chúng theo thứ tự thêm vào, sau các phân loại cũ.
    const all = readAll_('categories').filter((c) => c.type === type);
    const old = all.filter((c) => Number(c.sort_order) > 0).sort((a, b) => a.sort_order - b.sort_order);
    const fresh = all.filter((c) => !(Number(c.sort_order) > 0));
    old.concat(fresh).forEach((c, i) => { if (Number(c.sort_order) !== i + 1) update_('categories', c.id, { sort_order: i + 1 }); });
  });
  return added;
}

// ───────────────────────── CONFIG ─────────────────────────

function readConfig_() {
  const out = {};
  readAll_('config').forEach((r) => { if (r.key) out[r.key] = r.value; });
  // Tọa độ nhà bị Sheet đọc sai (vd 21028) thì sửa lại; thiếu hoặc hỏng hẳn thì để nguyên.
  const home = fixLatLng_(out.home_lat, out.home_lng);
  if (home.lat != null) { out.home_lat = String(home.lat); out.home_lng = String(home.lng); }
  return out;
}

function getConfigValue_(key) {
  try { return readConfig_()[key]; } catch (e) { return null; }
}

function setConfigValue_(key, value) {
  const sh = sheet_('config');
  const values = sh.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][0]) === key) { sh.getRange(r + 1, 2).setValue("'" + value); return; }
  }
  sh.appendRow(["'" + key, "'" + value, '']);
}

// ───────────────────────── DỮ LIỆU TỔNG ─────────────────────────

/** Món đã thử của các bữa (bỏ dòng thuộc bữa đã xóa). */
function mealDishesOf_(meals) {
  const ids = {}; meals.forEach((m) => { ids[m.id] = true; });
  return safeReadAll_('mealDishes').filter((x) => ids[x.meal_id]);
}

/** Số liệu theo quán từ các bữa: số bữa, điểm bữa trung bình, lần cuối, trung bình từng tiêu chí. */
function restaurantMealStats_(meals) {
  const out = {};
  meals.forEach((m) => {
    if (!m.restaurant_id) return;
    const s = out[m.restaurant_id] || (out[m.restaurant_id] = { n: 0, sum: 0, cnt: 0, last: null, crit: {} });
    s.n++;
    if (isNum_(m.rating)) { s.sum += Number(m.rating); s.cnt++; }
    if (m.date && (!s.last || m.date > s.last)) s.last = m.date;
    Object.keys(RATING_WEIGHTS).forEach((k) => {
      if (!isNum_(m[k])) return;
      const c = s.crit[k] || (s.crit[k] = { sum: 0, n: 0 });
      c.sum += Number(m[k]); c.n++;
    });
  });
  return out;
}

/** Số liệu theo món: 1 bữa tính 1 lần cho mỗi món (món chính của bữa + các món đã thử).
 *  Điểm món lấy từ MealDishes; bữa cũ chưa có MealDishes thì dùng điểm của bữa cho món chính. */
function dishMealStats_(meals, mealDishes) {
  const byMeal = {};
  mealDishes.forEach((x) => { (byMeal[x.meal_id] = byMeal[x.meal_id] || []).push(x); });
  const out = {};
  const stat = (id) => out[id] || (out[id] = { n: 0, sum: 0, cnt: 0, last: null });
  meals.forEach((m) => {
    const rows = byMeal[m.id] || [];
    const seen = {};
    if (m.dish_id) seen[m.dish_id] = true;
    rows.forEach((x) => { if (x.dish_id) seen[x.dish_id] = true; });
    Object.keys(seen).forEach((id) => {
      const s = stat(id);
      s.n++;
      if (m.date && (!s.last || m.date > s.last)) s.last = m.date;
    });
    rows.forEach((x) => { if (x.dish_id && isNum_(x.rating)) { const s = stat(x.dish_id); s.sum += Number(x.rating); s.cnt++; } });
    if (!rows.length && m.dish_id && isNum_(m.rating)) { const s = stat(m.dish_id); s.sum += Number(m.rating); s.cnt++; }
  });
  return out;
}

/** Như readAll_ nhưng trả [] khi sheet chưa có (Sheet cũ chưa chạy lại setupSheets). */
function safeReadAll_(table, includeDeleted) {
  const def = TABLES[table];
  if (!SpreadsheetApp.getActive().getSheetByName(def.sheet)) return [];
  return readAll_(table, includeDeleted);
}

/** Toàn bộ dữ liệu app cần khi mở lên, kèm số liệu tổng hợp (số lần ăn, điểm trung bình, lần cuối ăn). */
function bootstrap_() {
  const restaurants = readAll_('restaurants');
  const dishes = readAll_('dishes');
  const links = readAll_('restaurantDishes');
  const questions = readAll_('questions')
    .filter((q) => q.active !== false)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const meals = readAll_('meals');
  const dishHeaders = headersOf_(sheet_('dishes'));
  const attrs = dishAttrs_(dishHeaders);

  const mealDishes = mealDishesOf_(meals);
  const rStat = restaurantMealStats_(meals);
  const dStat = dishMealStats_(meals, mealDishes);

  restaurants.forEach((r) => {
    const s = rStat[r.id];
    r.visit_count = s ? s.n : 0;
    r.meal_rating_avg = s && s.cnt ? round1_(s.sum / s.cnt) : null;
    r.last_visit = s ? s.last : null;
    // Trung bình từng tiêu chí qua các bữa đã ăn (điểm quán "cả quá trình").
    r.meal_avg = {};
    Object.keys(RATING_WEIGHTS).forEach((k) => {
      r.meal_avg[k] = s && s.crit[k] && s.crit[k].n ? round1_(s.crit[k].sum / s.crit[k].n) : null;
    });
    // Nhập thẳng vào Sheet thì cột rating có thể trống: tính từ 4 tiêu chí như khi thêm qua app.
    if (!isNum_(r.rating)) r.rating = calcRating_(r);
    // Điểm xếp hạng "Ngon nhất": trung bình các bữa đã ăn; quán chưa có bữa nào thì dùng rating nhập tay.
    r.score = r.meal_rating_avg != null ? r.meal_rating_avg : (r.rating != null ? r.rating : null);
  });
  dishes.forEach((d) => {
    const s = dStat[d.id];
    d.times_eaten = s ? s.n : 0;
    d.avg_rating = s && s.cnt ? round1_(s.sum / s.cnt) : null;
    d.last_eaten = s ? s.last : null;
    d.restaurant_count = 0;
  });

  const rIds = {}; restaurants.forEach((r) => { rIds[r.id] = true; });
  const dMap = {}; dishes.forEach((d) => { dMap[d.id] = d; });
  const validLinks = links.filter((l) => rIds[l.restaurant_id] && dMap[l.dish_id]);
  validLinks.forEach((l) => { dMap[l.dish_id].restaurant_count++; });
  // Mặt bằng giá món: trung bình giá món tại các quán (dùng cho price_bias của ngữ cảnh).
  const priceSum = {};
  validLinks.forEach((l) => {
    if (!isNum_(l.price)) return;
    const s = priceSum[l.dish_id] || (priceSum[l.dish_id] = { sum: 0, n: 0 });
    s.sum += Number(l.price); s.n++;
  });
  dishes.forEach((d) => { d.price_avg = priceSum[d.id] ? Math.round(priceSum[d.id].sum / priceSum[d.id].n) : null; });

  const config = readConfig_();
  const contextRules = safeReadAll_('contextRules')
    .filter((r) => r.active !== false && r.key)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  return {
    restaurants: restaurants,
    dishes: dishes,
    restaurantDishes: validLinks,
    questions: questions,
    dishAttrs: dishAttrGroups_(attrs).reduce((out, g) => out.concat(g.attrs), []),
    dishAttrGroups: dishAttrGroups_(attrs),
    categories: readAll_('categories').sort((a, b) =>
      String(a.type).localeCompare(String(b.type)) || (a.sort_order || 0) - (b.sort_order || 0)),
    ratingWeights: RATING_WEIGHTS,
    ratingLabels: RATING_LABELS,
    contextRules: contextRules,
    learned: learnedWeights_(contextAttrStats_(meals, dMap, attrs), config),
    config: config,
    serverTime: nowIso_(),
    backendVersion: backendVersion_()
  };
}

/** Nhóm các cột thuộc tính đang có trong sheet Dishes; cột lạ xếp vào nhóm "Khác". */
function dishAttrGroups_(attrs) {
  const groups = DISH_ATTR_GROUPS.map((g) => ({
    key: g.key, label: g.label,
    attrs: g.attrs.filter((a) => attrs.indexOf(a[0]) >= 0).map((a) => ({ key: a[0], label: a[1] }))
  })).filter((g) => g.attrs.length);
  const other = attrs.filter((a) => !ATTR_LABELS[a]).map((a) => ({ key: a, label: a }));
  if (other.length) groups.push({ key: 'khac', label: 'Khác', attrs: other });
  return groups;
}

// ───────────────────────── LOGIC GỢI Ý MÓN ─────────────────────────
// Các hàm dưới đây chỉ làm việc trên dữ liệu (không đụng tới Sheet),
// nên frontend có thể chép nguyên logic về chạy offline cho nhanh.

/** "nuoc=TRUE;nong=FALSE" -> [{attr:'nuoc', value:true}, {attr:'nong', value:false}] */
function parseRule_(rule) {
  return String(rule || '').split(/[;,&]/).map((s) => s.trim()).filter(Boolean).map((part) => {
    const kv = part.split('=');
    return { attr: kv[0].trim(), value: kv.length < 2 ? true : toBool_(kv[1]) };
  });
}

/** answers: [{question_id, choice:'A'|'B'}] -> mảng nhóm điều kiện theo thứ tự trả lời. */
function constraintGroups_(answers, questions) {
  const qMap = {}; questions.forEach((q) => { qMap[q.id] = q; });
  return (answers || []).map((a) => {
    const q = qMap[a.question_id];
    if (!q) return null;
    const isA = String(a.choice).toUpperCase() === 'A';
    return { question: q, choice: isA ? 'A' : 'B', rules: parseRule_(isA ? q.rule_a : q.rule_b) };
  }).filter(Boolean);
}

function matchRules_(dish, rules) {
  return rules.every((c) => toBool_(dish[c.attr]) === c.value);
}

/** Lọc món theo câu trả lời. Nếu không còn món nào, bỏ dần điều kiện cũ nhất. */
function filterDishes_(data, answers, rejected, now) {
  const rej = {}; (rejected || []).forEach((id) => { rej[id] = true; });
  let pool = data.dishes.filter((d) => !rej[d.id]);
  // Ưu tiên món có quán ĐANG MỞ; nếu không có thì món có quán bán; nếu chưa gán quán nào thì lấy tất cả.
  const at = now ? new Date(now) : new Date();
  const rMap = {}; data.restaurants.forEach((r) => { rMap[r.id] = r; });
  const openDish = {};
  data.restaurantDishes.forEach((l) => { if (rMap[l.restaurant_id] && isOpenAt_(rMap[l.restaurant_id], at)) openDish[l.dish_id] = true; });
  const openNow = pool.filter((d) => openDish[d.id]);
  const served = pool.filter((d) => d.restaurant_count > 0);
  if (openNow.length) pool = openNow;
  else if (served.length) pool = served;

  let groups = constraintGroups_(answers, data.questions);
  const relaxed = [];
  let candidates = pool.filter((d) => groups.every((g) => matchRules_(d, g.rules)));
  while (!candidates.length && groups.length) {
    relaxed.push(groups[0].question.text);
    groups = groups.slice(1);
    candidates = pool.filter((d) => groups.every((g) => matchRules_(d, g.rules)));
  }
  return { candidates: candidates, groups: groups, relaxed: relaxed };
}

function daysSince_(dateStr) {
  if (!dateStr) return null;
  return dayNum_(today_()) - dayNum_(String(dateStr));
}

function dayNum_(s) {
  const p = String(s).slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000);
}

/** Trọng số random: món ngon được ưu tiên, món vừa ăn gần đây bị giảm cơ hội. */
function dishWeight_(d, ctx) {
  const base = d.avg_rating != null ? d.avg_rating : 3.5;
  const days = daysSince_(d.last_eaten);
  const recency = days == null ? 1 : Math.min(1, Math.max(0.15, days / 14));
  const w = Math.max(0.05, base * recency);
  if (!ctx) return w;
  // Có ngữ cảnh: nhân thêm hệ số ngữ cảnh và hệ số vị trí (xem phần NGỮ CẢNH).
  const loc = ctx.locFactor[d.id];
  return w * contextMultiplier_(d, ctx) * (loc == null ? 1 : loc);
}

function weightedPick_(items, weightFn) {
  const total = items.reduce((s, x) => s + weightFn(x), 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) { r -= weightFn(items[i]); if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

/** payload: {answers:[{question_id, choice}], rejected:[dish_id], now?, context?} */
function suggestDish_(data, p) {
  const f = filterDishes_(data, p.answers, p.rejected, p.now);
  const ctx = buildContext_(data, p);
  if (!f.candidates.length) return { dish: null, candidates: 0, relaxed: f.relaxed, exhausted: true, reasons: [], context: ctxSummary_(ctx) };
  const dish = weightedPick_(f.candidates, (d) => dishWeight_(d, ctx));
  return {
    dish: dish, candidates: f.candidates.length, relaxed: f.relaxed, exhausted: false,
    reasons: contextReasons_(ctx, dish), context: ctxSummary_(ctx)
  };
}

/** Chọn câu hỏi tiếp theo chia đôi danh sách món còn lại đều nhất.
 *  payload: {answers:[...], rejected:[...]} */
function nextQuestion_(data, p) {
  const asked = {}; (p.answers || []).forEach((a) => { asked[a.question_id] = true; });
  const remaining = data.questions.filter((q) => !asked[q.id]);
  if (!remaining.length) return { question: null };
  const pool = filterDishes_(data, p.answers, p.rejected, p.now).candidates;

  let best = null; let bestScore = -1;
  remaining.forEach((q) => {
    const a = pool.filter((d) => matchRules_(d, parseRule_(q.rule_a))).length;
    const b = pool.filter((d) => matchRules_(d, parseRule_(q.rule_b))).length;
    // Câu hỏi tốt: cả 2 lựa chọn đều còn món, và chia càng đều càng tốt.
    const score = (a && b) ? Math.min(a, b) / Math.max(a, b) + 1 : (a || b ? 0.5 : 0);
    const jitter = Math.random() * 0.05; // để thứ tự câu hỏi không lặp y hệt mỗi lần
    if (score + jitter > bestScore) { bestScore = score + jitter; best = q; }
  });
  return { question: best, asked: Object.keys(asked).length, total: data.questions.length };
}

// ───────────────────────── LOGIC GỢI Ý QUÁN ─────────────────────────

function toMinutes_(hm) {
  if (hm == null || hm === '') return null;
  const m = String(hm).match(/(\d{1,2})[:hH.](\d{2})?/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2] || 0);
}

/** open_days: để trống = mở cả tuần. Ví dụ: "T2-T6", "T2,T4,T6", "T7,CN", "T2-CN". */
function openDays_(spec) {
  if (!spec || !String(spec).trim()) return [0, 1, 2, 3, 4, 5, 6];
  const idx = (t) => {
    t = t.trim().toUpperCase().replace(/\s/g, '');
    if (t === 'CN' || t === 'C.N' || t === 'CHUNHAT') return 7;
    const n = Number(t.replace(/^T(HU)?/, ''));
    return n >= 2 && n <= 7 ? n - 1 : null;
  };
  const days = {};
  String(spec).split(/[,;]/).forEach((part) => {
    const range = part.split('-');
    if (range.length === 2) {
      const a = idx(range[0]); const b = idx(range[1]);
      if (a == null || b == null) return;
      for (let d = a; ; d = d % 7 + 1) { days[d % 7] = true; if (d === b) break; }
    } else {
      const d = idx(part); if (d != null) days[d % 7] = true;
    }
  });
  return Object.keys(days).map(Number);
}

/** Quán có đang mở vào thời điểm `now` (giờ Việt Nam) không. Hỗ trợ quán mở qua đêm. */
function isOpenAt_(r, now) {
  const open = toMinutes_(r.open_time);
  const close = toMinutes_(r.close_time);
  if (open == null || close == null) return true; // không có giờ thì coi như đang mở
  const cur = Number(Utilities.formatDate(now, TZ, 'H')) * 60 + Number(Utilities.formatDate(now, TZ, 'm'));
  const dow = Number(Utilities.formatDate(now, TZ, 'u')) % 7; // 0 = CN
  const days = openDays_(r.open_days);
  const has = (d) => days.indexOf((d + 7) % 7) >= 0;
  if (open === close) return has(dow); // mở 24h
  if (open < close) return has(dow) && cur >= open && cur < close;
  // Qua đêm (vd 18:00 – 02:00)
  return (has(dow) && cur >= open) || (has(dow - 1) && cur < close);
}

function haversineKm_(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const rad = (x) => x * Math.PI / 180;
  const dLat = rad(lat2 - lat1); const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function isNum_(v) { return v !== null && v !== '' && !isNaN(Number(v)); }

/** payload: {dish_id, lat?, lng?, context?}. Không có vị trí thì dùng home_lat/home_lng trong Config.
 *  Có context: xếp quán theo điểm cân bằng điểm/độ gần và đánh dấu out_of_radius. */
function suggestRestaurants_(data, p) {
  if (!p.dish_id) throw new Error('Thiếu dish_id');
  const now = p.now ? new Date(p.now) : new Date();
  const c = p.context || {};
  let lat = isNum_(p.lat) ? p.lat : c.lat; let lng = isNum_(p.lng) ? p.lng : c.lng; let locationSource = 'device';
  if (!isNum_(lat) || !isNum_(lng)) { lat = data.config.home_lat; lng = data.config.home_lng; locationSource = 'home'; }
  const hasLoc = isNum_(lat) && isNum_(lng);
  if (!hasLoc) locationSource = 'none';

  const rMap = {}; data.restaurants.forEach((r) => { rMap[r.id] = r; });
  const list = data.restaurantDishes.filter((l) => l.dish_id === p.dish_id).map((l) => {
    const r = rMap[l.restaurant_id];
    const distance = hasLoc && isNum_(r.lat) && isNum_(r.lng)
      ? round1_(haversineKm_(Number(lat), Number(lng), Number(r.lat), Number(r.lng))) : null;
    return Object.assign({}, r, {
      dish_price: l.price, dish_rating: l.dish_rating, distance_km: distance, is_open: isOpenAt_(r, now),
      maps_link: r.maps_url || (isNum_(r.lat) && isNum_(r.lng)
        ? 'https://www.google.com/maps/dir/?api=1&destination=' + r.lat + ',' + r.lng : null)
    });
  });

  const open = list.filter((r) => r.is_open);
  const scoreOf = (r) => (r.dish_rating != null ? r.dish_rating : (r.score != null ? r.score : 0));
  const bestScore = open.length ? Math.max.apply(null, open.map(scoreOf)) : null;
  const withDist = open.filter((r) => r.distance_km != null);
  const nearest = withDist.length ? Math.min.apply(null, withDist.map((r) => r.distance_km)) : null;
  open.forEach((r) => {
    r.is_best = bestScore != null && bestScore > 0 && scoreOf(r) === bestScore;
    r.is_nearest = nearest != null && r.distance_km === nearest;
  });
  open.sort((a, b) => scoreOf(b) - scoreOf(a));
  const ctx = buildContext_(data, p);
  if (ctx) rankRestaurants_(open, ctx, scoreOf);

  const dish = data.dishes.filter((d) => d.id === p.dish_id)[0] || null;
  return {
    dish: dish,
    open: open,
    closed: list.filter((r) => !r.is_open).map((r) => ({ id: r.id, name: r.name, open_time: r.open_time, close_time: r.close_time })),
    location_source: locationSource,
    radius_km: ctx ? ctx.loc.radius_km : null
  };
}

// ───────────────────────── NGỮ CẢNH (thời tiết · giờ · tâm trạng · dịp) ─────────────────────────
// Ngữ cảnh chỉ làm NGHIÊNG trọng số random, không loại món nào. Luật nằm ở sheet ContextRules.
// Không truyền `context` thì mọi gợi ý chạy y như cũ.

function clamp_(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function arr_(v) { return Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]); }
function uniq_(v) { const seen = {}; return arr_(v).map(String).filter((k) => !seen[k] && (seen[k] = true)); }
function splitTags_(v) { return arr_(Array.isArray(v) ? v : String(v || '').split(',')).map((s) => String(s).trim()).filter(Boolean); }
function num0_(v) { return isNum_(v) ? Number(v) : 0; }

function cfgDefault_(key) { const d = CONFIG_DEFAULTS.filter((c) => c[0] === key)[0]; return d ? d[1] : ''; }
function cfgNum_(config, key) {
  const v = config ? config[key] : undefined;
  return isNum_(v) ? Number(v) : num0_(cfgDefault_(key));
}
function cfgBool_(config, key) {
  const v = config ? config[key] : undefined;
  return toBool_(v === undefined || v === null || v === '' ? cfgDefault_(key) : v);
}

/** "nuoc=2;nong=-1;cay" -> {nuoc:2, nong:-1, cay:1}. TRUE/FALSE hiểu là 1/-1; giá trị không phải số thì bỏ qua. */
function parseWeights_(rule) {
  const out = {};
  String(rule || '').split(/[;&]/).map((s) => s.trim()).filter(Boolean).forEach((part) => {
    const kv = part.split('=');
    const k = kv[0].trim();
    if (!k) return;
    let w = 1;
    if (kv.length > 1) {
      const raw = kv[1].trim();
      if (/^(true|false)$/i.test(raw)) w = toBool_(raw) ? 1 : -1;
      else { w = Number(raw.replace(',', '.')); if (isNaN(w)) return; }
    }
    out[k] = (out[k] || 0) + w;
  });
  return out;
}

/** Giờ Việt Nam -> buổi: 5–10 sáng, 10–14 trưa, 14–17 chiều, 17–22 tối, còn lại khuya. */
function timeBucket_(hour) {
  if (hour >= 5 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 14) return 'noon';
  if (hour >= 14 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late_night';
}

/** Mã thời tiết WMO có mưa: mưa phùn/mưa (51–67), mưa rào (80–82), dông (95–99). */
function isRainCode_(c) { c = Number(c); return (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || (c >= 95 && c <= 99); }

/** Số liệu thời tiết thô -> khóa: "rain" (độc lập) + đúng 1 mức nhiệt (khoảng giữa mát và nóng thì không có). */
function weatherKeys_(raw, config) {
  if (!raw) return [];
  const keys = [];
  if ((isNum_(raw.precip) && Number(raw.precip) > 0)
    || (isNum_(raw.rain_prob) && Number(raw.rain_prob) >= cfgNum_(config, 'rain_prob_min'))
    || (isNum_(raw.weather_code) && isRainCode_(raw.weather_code))) keys.push('rain');
  if (isNum_(raw.temp)) {
    const t = Number(raw.temp);
    const feel = isNum_(raw.apparent) ? Number(raw.apparent) : t;
    if (t <= cfgNum_(config, 'temp_cold_max')) keys.push('cold');
    else if (t <= cfgNum_(config, 'temp_cool_max')) keys.push('cool');
    else if (t >= cfgNum_(config, 'temp_hot_min') || feel >= 36) {
      const humid = isNum_(raw.humidity) && Number(raw.humidity) >= cfgNum_(config, 'humid_min');
      keys.push(humid || feel >= 36 ? 'hot_humid' : 'hot');
    }
  }
  return keys;
}

/** date: "MM-DD" (lặp hằng năm) hoặc "yyyy-MM-dd" (1 lần). Khớp khi hôm nay lệch ≤ window ngày. */
function occasionMatches_(date, today, window) {
  const d = String(date || '').trim();
  if (!d) return false;
  const t = dayNum_(today);
  let m = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return Math.abs(dayNum_(m[1] + '-' + m[2] + '-' + m[3]) - t) <= window;
  m = d.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return false;
  const y = Number(today.slice(0, 4));
  return [y - 1, y, y + 1].some((yy) => Math.abs(dayNum_(yy + '-' + m[1] + '-' + m[2]) - t) <= window);
}

/** c: {weather:{temp, apparent, humidity, precip, rain_prob, weather_code}, weather_override?, moods:[key],
 *      occasions:[key], occasions_off?:[key], mode?:'quick'|'ab', hour?}
 *  -> các luật ngữ cảnh đang áp dụng. Giờ trong ngày chỉ tính ở Gợi ý nhanh hoặc khi đã có ngữ cảnh khác,
 *  để luồng A/B không có ngữ cảnh gì vẫn y như cũ. */
function deriveContext_(data, c, now) {
  c = c || {};
  const at = now ? new Date(now) : new Date();
  const config = data.config || {};
  const rules = data.contextRules || [];
  const find = (type, key) => rules.filter((r) => r.type === type && String(r.key) === String(key))[0];
  const hour = isNum_(c.hour) ? Number(c.hour) : Number(Utilities.formatDate(at, TZ, 'H'));
  const today = Utilities.formatDate(at, TZ, 'yyyy-MM-dd');
  const bucket = timeBucket_(hour);

  let wKeys; let wSource = null;
  if (c.weather_override === 'none') { wKeys = []; wSource = 'manual'; } else if (WEATHER_KEYS.indexOf(c.weather_override) >= 0) {
    wKeys = [c.weather_override]; wSource = 'manual';
  } else { wKeys = weatherKeys_(c.weather, config); wSource = c.weather ? 'auto' : null; }
  const moods = uniq_(c.moods).filter((k) => find('mood', k)).slice(0, 2);
  const autoOcc = rules.filter((r) => r.type === 'occasion'
    && occasionMatches_(r.date, today, cfgNum_(config, 'occasion_window_days'))).map((r) => String(r.key));
  const off = uniq_(c.occasions_off);
  const occasions = uniq_(autoOcc.filter((k) => off.indexOf(k) < 0).concat(uniq_(c.occasions).filter((k) => find('occasion', k))));
  const useTime = c.mode === 'quick' || wKeys.length > 0 || moods.length > 0 || occasions.length > 0;

  const applied = wKeys.map((k) => find('weather', k))
    .concat(useTime ? [find('time', bucket)] : [])
    .concat(moods.map((k) => find('mood', k)))
    .concat(occasions.map((k) => find('occasion', k)))
    .filter(Boolean);
  return {
    keys: applied.map((r) => String(r.key)),
    labels: applied.map((r) => String(r.label || r.key)),
    rules: applied.map((r) => ({
      type: r.type, key: String(r.key), label: String(r.label || r.key), emoji: r.emoji || '', message: r.message || '',
      weights: parseWeights_(r.rule), price_bias: num0_(r.price_bias), novelty_bias: num0_(r.novelty_bias)
    })),
    weather: Object.assign({}, c.weather || {}, { keys: wKeys, source: wSource }),
    moods: moods, occasions: occasions, auto_occasions: autoOcc, time_bucket: bucket, today: today
  };
}

/** Vị trí cho ngữ cảnh: điện thoại → nhà (Config) → không có.
 *  radius_km: không truyền = mặc định Config; null hoặc 0 = không giới hạn. */
function contextLocation_(data, p, c) {
  let lat = isNum_(p.lat) ? p.lat : c.lat;
  let lng = isNum_(p.lng) ? p.lng : c.lng;
  let source = 'device';
  if (!isNum_(lat) || !isNum_(lng)) { lat = data.config.home_lat; lng = data.config.home_lng; source = 'home'; }
  let radius = p.radius_km !== undefined ? p.radius_km : c.radius_km;
  radius = radius === undefined ? cfgNum_(data.config, 'default_radius_km') : (isNum_(radius) && Number(radius) > 0 ? Number(radius) : null);
  if (!isNum_(lat) || !isNum_(lng)) return { lat: null, lng: null, source: 'none', radius_km: radius };
  return { lat: Number(lat), lng: Number(lng), source: source, radius_km: radius };
}

/** Vị trí phần trăm của giá món so với các món khác, quy về [-1, 1]. Món chưa có giá = 0. */
function pricePositions_(dishes) {
  const list = dishes.filter((d) => isNum_(d.price_avg)).map((d) => Number(d.price_avg)).sort((a, b) => a - b);
  const out = {};
  if (list.length < 2) return out;
  dishes.forEach((d) => {
    if (!isNum_(d.price_avg)) return;
    const v = Number(d.price_avg);
    const below = list.filter((x) => x < v).length;
    const same = list.filter((x) => x === v).length;
    out[d.id] = ((below + (same - 1) / 2) / (list.length - 1)) * 2 - 1;
  });
  return out;
}

/** Hệ số vị trí mỗi món, theo quán ĐANG MỞ gần nhất bán món đó:
 *  trong bán kính 1 − 0.3·(d/R) · ngoài bán kính 0.25 · không rõ khoảng cách 0.8 · không có vị trí hoặc không giới hạn 1.
 *  Món chỉ có quán đang đóng: 0.5. */
function locFactors_(data, loc, at) {
  const out = {};
  if (!loc || loc.source === 'none') return out;
  const rMap = {}; data.restaurants.forEach((r) => { rMap[r.id] = r; });
  const best = {};
  data.restaurantDishes.forEach((l) => {
    const r = rMap[l.restaurant_id];
    if (!r || !isOpenAt_(r, at)) return;
    const d = isNum_(r.lat) && isNum_(r.lng) ? haversineKm_(loc.lat, loc.lng, Number(r.lat), Number(r.lng)) : null;
    const cur = best[l.dish_id];
    if (cur === undefined || (d != null && (cur == null || d < cur))) best[l.dish_id] = d;
  });
  data.dishes.forEach((dish) => {
    if (!Object.prototype.hasOwnProperty.call(best, dish.id)) { out[dish.id] = dish.restaurant_count > 0 ? 0.5 : 1; return; }
    const d = best[dish.id];
    if (d == null) out[dish.id] = 0.8;
    else if (!loc.radius_km) out[dish.id] = 1;
    else out[dish.id] = d <= loc.radius_km ? 1 - 0.3 * (d / loc.radius_km) : 0.25;
  });
  return out;
}

/** Chuẩn bị ngữ cảnh cho 1 lần gợi ý. Không có p.context (và không phải Gợi ý nhanh) → null: gợi ý y như cũ. */
function buildContext_(data, p, mode) {
  if (p._ctx) return p._ctx;
  if (!p.context && mode !== 'quick') return null;
  const c = Object.assign({}, p.context || {});
  if (mode) c.mode = mode;
  const at = p.now ? new Date(p.now) : (c.now ? new Date(c.now) : new Date());
  const ctx = deriveContext_(data, c, at);
  ctx.mode = c.mode || 'ab';
  ctx.at = at;
  ctx.loc = contextLocation_(data, p, c);
  // Luồng A/B chưa có tín hiệu nào (không thời tiết, mood, dịp, GPS) → coi như không có ngữ cảnh, chạy y như cũ.
  if (ctx.mode !== 'quick' && !ctx.keys.length && ctx.loc.source !== 'device') return null;
  ctx.strength = cfgNum_(data.config, 'context_strength');
  ctx.learned = data.learned || {};
  ctx.pricePos = pricePositions_(data.dishes);
  ctx.locFactor = locFactors_(data, ctx.loc, at);
  return ctx;
}

/** Phần gọn của ngữ cảnh để trả về frontend / lưu vào Sessions. */
function ctxSummary_(ctx) {
  if (!ctx) return null;
  return {
    mode: ctx.mode, keys: ctx.keys, labels: ctx.labels, time_bucket: ctx.time_bucket, weather: ctx.weather,
    moods: ctx.moods, occasions: ctx.occasions, auto_occasions: ctx.auto_occasions,
    location_source: ctx.loc.source, radius_km: ctx.loc.radius_km
  };
}

/** Điểm ngữ cảnh của 1 món: Σ trọng số thuộc tính (kẹp mềm ±4) + phần học từ lịch sử + giá + mới lạ. */
function contextScore_(dish, ctx) {
  let total = 0;
  ctx.rules.forEach((r) => Object.keys(r.weights).forEach((a) => { if (toBool_(dish[a])) total += r.weights[a]; }));
  // Kẹp mềm về (−4, 4): 4·tanh(x/4). Kẹp cứng làm món "mưa + nóng + có nước" và món chỉ "nóng" cùng chạm trần 4,
  // mất hết khác biệt; kẹp mềm giữ thứ tự mà vẫn chặn trên/dưới.
  total = 4 * Math.tanh(total / 4);
  ctx.keys.forEach((k) => {
    const w = ctx.learned[k];
    if (w) Object.keys(w).forEach((a) => { if (toBool_(dish[a])) total += w[a]; });
  });
  const priceBias = clamp_(ctx.rules.reduce((s, r) => s + r.price_bias, 0), -1, 1);
  if (priceBias) total += priceBias * (ctx.pricePos[dish.id] || 0);
  const novelty = ctx.rules.reduce((m, r) => Math.max(m, r.novelty_bias), 0);
  if (novelty > 0) total += novelty / (1 + (dish.times_eaten || 0));
  return total;
}

function contextMultiplier_(dish, ctx) {
  return clamp_(Math.exp(ctx.strength * contextScore_(dish, ctx)), 0.2, 5);
}

/** Câu "vì sao": dịp đặc biệt trước, rồi các ngữ cảnh đẩy món này lên nhiều nhất (tối đa 3 câu).
 *  Luật có trọng số thuộc tính chỉ được nêu khi món khớp ít nhất một nửa phần trọng số dương của luật,
 *  để không nói "món có nước" cho món khô chỉ vì nó nóng. */
function contextReasons_(ctx, dish) {
  if (!ctx || !dish) return [];
  return ctx.rules.filter((r) => r.message).map((r) => {
    let s = 0; let pos = 0; let hit = 0;
    Object.keys(r.weights).forEach((a) => {
      const w = r.weights[a];
      if (w > 0) pos += w;
      if (toBool_(dish[a])) { s += w; if (w > 0) hit += w; }
    });
    const fits = pos === 0 || hit >= pos / 2;
    if (r.price_bias) s += r.price_bias * (ctx.pricePos[dish.id] || 0);
    if (r.novelty_bias > 0) s += r.novelty_bias / (1 + (dish.times_eaten || 0));
    return { r: r, s: r.type === 'occasion' ? 100 + s : (fits ? s : 0) };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.r.message);
}

/** Xếp quán theo điểm cân bằng 0.6·điểm + 0.4·độ gần; quán ngoài bán kính xuống cuối (out_of_radius).
 *  Dịp/tâm trạng có price_bias thì cộng nhẹ cho quán điểm cao/giá cao (hoặc rẻ khi price_bias âm). */
function rankRestaurants_(list, ctx, scoreOf) {
  const R = ctx.loc.radius_km;
  const priceBias = clamp_(ctx.rules.reduce((s, r) => s + r.price_bias, 0), -1, 1);
  const priceOf = (r) => (isNum_(r.dish_price) ? Number(r.dish_price)
    : (isNum_(r.price_min) && isNum_(r.price_max) ? (Number(r.price_min) + Number(r.price_max)) / 2
      : (isNum_(r.price_max) ? Number(r.price_max) : (isNum_(r.price_min) ? Number(r.price_min) : null))));
  const prices = list.map(priceOf).filter((x) => x != null).sort((a, b) => a - b);
  list.forEach((r) => {
    const sc = scoreOf(r);
    const norm = sc > 0 ? clamp_(sc / 5, 0, 1) : 0.5;
    let close = 0.5;
    if (r.distance_km != null) close = R ? clamp_(1 - r.distance_km / R, 0, 1) : 1 / (1 + r.distance_km / 5);
    let bal = 0.6 * norm + 0.4 * close;
    const pr = priceOf(r);
    if (priceBias && pr != null && prices.length > 1) {
      const pct = prices.filter((x) => x < pr).length / (prices.length - 1);
      bal += 0.05 * priceBias * (2 * pct - 1);
    }
    if (priceBias > 0) bal += 0.1 * norm;
    r.out_of_radius = !!(R && r.distance_km != null && r.distance_km > R);
    r.match_score = Math.round(bal * 1000) / 1000;
  });
  list.sort((a, b) => (Number(a.out_of_radius) - Number(b.out_of_radius)) || (b.match_score - a.match_score));
  return list;
}

function fmtKm_(km) { return km < 1 ? Math.round(km * 1000) + ' m' : String(round1_(km)).replace('.', ',') + ' km'; }

/** Gợi ý nhanh 1 chạm: không hỏi A/B, chọn món theo ngữ cảnh rồi xếp quán luôn.
 *  payload: {context, rejected:[...], lat?, lng?, radius_km?, now?, dish_id? (chọn sẵn món, vd từ alternatives)} */
function suggestQuick_(data, p) {
  const ctx = buildContext_(data, p, 'quick');
  const pool = filterDishes_(data, [], p.rejected, ctx.at).candidates;
  const summary = ctxSummary_(ctx);
  if (!pool.length) return { dish: null, restaurants: null, reasons: [], context: summary, alternatives: [], exhausted: true };
  const weight = (d) => dishWeight_(d, ctx);
  let dish = p.dish_id ? data.dishes.filter((d) => d.id === p.dish_id)[0] : null;
  if (!dish) dish = weightedPick_(pool, weight);
  const rest = pool.filter((d) => d.id !== dish.id);
  const alternatives = [];
  while (alternatives.length < 2 && rest.length) {
    const a = weightedPick_(rest, weight);
    alternatives.push(a);
    rest.splice(rest.indexOf(a), 1);
  }
  const c = p.context || {};
  const restaurants = suggestRestaurants_(data, {
    dish_id: dish.id, lat: isNum_(p.lat) ? p.lat : c.lat, lng: isNum_(p.lng) ? p.lng : c.lng, now: ctx.at, _ctx: ctx
  });
  const reasons = contextReasons_(ctx, dish);
  const top = restaurants.open[0];
  if (top && top.distance_km != null) {
    reasons.push(top.out_of_radius
      ? 'Quán gần nhất có món này hơi xa (' + fmtKm_(top.distance_km) + '), Cá cân nhắc nha.'
      : top.name + ' cách có ' + fmtKm_(top.distance_km) + ' thôi, đi liền nè.');
  }
  return { dish: dish, restaurants: restaurants, reasons: reasons, context: summary, alternatives: alternatives, exhausted: false };
}

/** Thống kê theo ngữ cảnh: với mỗi tag, số bữa (có món trong sổ) và số bữa có từng thuộc tính. Khóa '' = mọi bữa. */
function contextAttrStats_(meals, dMap, attrs) {
  const st = { '': { n: 0, c: {} } };
  meals.forEach((m) => {
    const d = dMap[m.dish_id];
    if (!d) return;
    [''].concat(splitTags_(m.context_tags)).forEach((t) => {
      const s = st[t] || (st[t] = { n: 0, c: {} });
      s.n++;
      attrs.forEach((a) => { if (toBool_(d[a])) s.c[a] = (s.c[a] || 0) + 1; });
    });
  });
  return st;
}

/** {tag: {thuộc tính: hệ số}} = clamp(log2(P(attr|tag) / P(attr)) × learn_strength, ±1.5),
 *  chỉ cho tag có ≥ learn_min_meals bữa. Làm trơn Laplace để tránh log(0). Không ghi đè luật trong Sheet. */
function learnedWeights_(st, config) {
  const out = {};
  if (!cfgBool_(config, 'learn_enabled')) return out;
  const all = st[''];
  if (!all || !all.n) return out;
  const min = cfgNum_(config, 'learn_min_meals');
  const k = cfgNum_(config, 'learn_strength');
  Object.keys(st).forEach((tag) => {
    if (!tag || st[tag].n < min) return;
    const w = {};
    Object.keys(all.c).forEach((a) => {
      const p = (all.c[a] + 1) / (all.n + 2);
      const pc = ((st[tag].c[a] || 0) + 1) / (st[tag].n + 2);
      const v = clamp_(Math.log(pc / p) / Math.LN2 * k, -1.5, 1.5);
      if (Math.abs(v) >= 0.05) w[a] = Math.round(v * 100) / 100;
    });
    out[tag] = w;
  });
  return out;
}

// ───────────────────────── LINK GOOGLE MAPS ─────────────────────────
// Dán link Google Maps khi thêm quán → lấy tên, tọa độ, địa chỉ, loại quán.
// Trình duyệt không đọc được trang Google Maps (CORS) nên việc mở link do Apps Script làm (UrlFetchApp).
// Phần đọc URL (parseMapsUrl_) không cần mạng, app dùng lại được cả ở chế độ dùng thử.

const MAPS_HOSTS = /^(maps\.app\.goo\.gl|goo\.gl|g\.co|maps\.google\.[a-z.]+|(www\.)?google\.[a-z.]+)$/i;

function isMapsUrl_(url) {
  const m = String(url || '').trim().match(/^https?:\/\/([^/?#]+)([^?#]*)/i);
  if (!m || !MAPS_HOSTS.test(m[1])) return false;
  // google.com chỉ nhận đường dẫn /maps…; goo.gl chỉ nhận /maps/… (link rút gọn kiểu cũ)
  if (/^(www\.)?google\./i.test(m[1])) return /^\/maps/.test(m[2]);
  if (/^goo\.gl$/i.test(m[1])) return /^\/maps\//.test(m[2]);
  return true;
}

function decodePart_(s) {
  try { return decodeURIComponent(String(s).replace(/\+/g, ' ')).trim(); } catch (e) { return String(s).replace(/\+/g, ' ').trim(); }
}
function isLatLngText_(s) { return /^\s*-?\d{1,3}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?\s*$/.test(String(s || '')); }

/** Đọc thông tin có sẵn trong URL (không cần mạng): {name, lat, lng, query, short}.
 *  Ưu tiên tọa độ ghim của quán (!3d…!4d…) hơn tâm bản đồ (@lat,lng). */
function parseMapsUrl_(url) {
  const u = String(url || '').trim();
  const out = { name: null, lat: null, lng: null, coord_src: null, query: null, short: /maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\//i.test(u) };
  // pin: ghim của quán · query: tọa độ trong ?q= · view: tâm bản đồ đang xem (kém chính xác nhất)
  const tries = [['pin', /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/],
    ['query', /[?&](?:q|query|destination|ll|center|daddr)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i],
    ['view', /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/]];
  for (let i = 0; i < tries.length; i++) {
    const m = u.match(tries[i][1]);
    if (!m) continue;
    const c = fixLatLng_(m[1], m[2]);
    if (c.lat != null) { out.lat = c.lat; out.lng = c.lng; out.coord_src = tries[i][0]; break; }
  }
  const place = u.match(/\/maps\/place\/([^/@?#]+)/i);
  if (place) {
    const n = decodePart_(place[1]);
    if (n && !isLatLngText_(n)) out.name = n;
  }
  const q = u.match(/[?&](?:q|query)=([^&#]+)/i);
  if (q) {
    const t = decodePart_(q[1]);
    if (t && !isLatLngText_(t)) { out.query = t; if (!out.name) out.name = t.split(',')[0].trim(); }
  }
  return out;
}

function htmlDecode_(s) {
  return String(s || '').replace(/&#(\d+);/g, (x, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (x, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function metaContent_(html, key) {
  const re1 = new RegExp('<meta[^>]+(?:property|itemprop|name)=["\']' + key + '["\'][^>]*content=["\']([^"\']*)["\']', 'i');
  const re2 = new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|itemprop|name)=["\']' + key + '["\']', 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? htmlDecode_(m[1]).trim() : '';
}

/** Đọc trang Google Maps của 1 quán: tên + địa chỉ ("Tên · Địa chỉ"), loại quán ("★★★★☆ · Quán phở"),
 *  tọa độ từ ảnh xem trước (center=lat,lng). Thiếu gì thì bỏ trống. */
function parseMapsHtml_(html) {
  const out = { name: null, address: null, type_text: null, lat: null, lng: null };
  const title = metaContent_(html, 'og:title') || metaContent_(html, 'name');
  if (title && !/^google maps$/i.test(title)) {
    const parts = title.split(/\s+·\s+/);
    out.name = parts[0] || null;
    if (parts.length > 1) out.address = parts.slice(1).join(', ');
  }
  const desc = metaContent_(html, 'og:description') || metaContent_(html, 'description');
  if (desc) {
    const segs = desc.split(/\s+·\s+/).map((x) => x.trim())
      .filter((x) => x && !/^[★☆\d.,\s()]+$/.test(x) && !/^\d+([.,]\d+)?\s*(sao|stars?)/i.test(x));
    if (segs.length) out.type_text = segs[segs.length - 1];
  }
  const img = metaContent_(html, 'og:image');
  const c = img.match(/center=(-?\d+(?:\.\d+)?)(?:%2C|,)(-?\d+(?:\.\d+)?)/i);
  if (c) { const f = fixLatLng_(c[1], c[2]); out.lat = f.lat; out.lng = f.lng; }
  return out;
}

/** Đoán phân loại quán từ loại quán / tên (vd "Quán phở" → "Bún/Phở"). Chỉ trả tên có trong danh sách. */
function guessRestaurantCategory_(text, names) {
  const t = ' ' + String(text || '').toLowerCase() + ' ';
  const rules = [
    ['Cà phê mèo', /(cà phê|cafe|café|coffee) mèo|cat caf[eé]/], ['Cà phê', /cà phê|cafe|café|coffee/], ['Trà sữa', /trà sữa|bubble tea|milk tea|tea shop/],
    ['Pub/Bar', /\bpub\b|\bbar\b|beer club|cocktail/], ['Buffet', /buffet/], ['Lẩu', /lẩu|hot ?pot/], ['Nướng', /nướng|bbq|barbecue|grill/],
    ['Gà rán', /gà rán|fried chicken|kfc|jollibee|popeyes|lotteria/], ['Ốc', /\bốc\b|snail/], ['Nhậu', /nhậu|bia hơi|beer/],
    ['Đồ Nhật', /nhật|japanese|sushi|ramen|udon/], ['Đồ Hàn', /hàn quốc|korean|tokbokki|kimbap/], ['Đồ Thái', /thái lan|\bthai\b|đồ thái/],
    ['Đồ Hoa', /trung hoa|chinese|dimsum|dim sum|há cảo|hoành thánh/], ['Đồ Âu', /pizza|pasta|steak|bít tết|burger|western|ý|italian|french|âu/],
    ['Bún/Phở', /phở|\bbún\b|pho|noodle soup|hủ tiếu|miến/], ['Cơm', /\bcơm\b|rice/], ['Mì', /\bmì\b|noodle/], ['Cháo', /cháo|congee|porridge/],
    ['Bánh', /bánh|bakery|banh mi|bánh mì/], ['Cuốn', /cuốn|spring roll/], ['Tráng miệng', /chè|kem|dessert|ice cream|sữa chua/],
    ['Ăn vặt', /ăn vặt|snack|street food/]
  ];
  const lower = {}; (names || []).forEach((n) => { lower[String(n).toLowerCase()] = n; });
  for (let i = 0; i < rules.length; i++) {
    if (rules[i][1].test(t) && lower[rules[i][0].toLowerCase()]) return lower[rules[i][0].toLowerCase()];
  }
  return null;
}

/** Mở link Google Maps (đi theo link rút gọn), lấy tên, tọa độ, địa chỉ, loại quán.
 *  Trả {ok_fetch, name, lat, lng, address, type_text, category, maps_url, note}. */
function resolveMapLink_(url) {
  url = String(url || '').trim();
  if (!isMapsUrl_(url)) throw new Error('Đây không phải link Google Maps. Dán link dạng maps.app.goo.gl/… hoặc google.com/maps/…');
  let finalUrl = url; let html = ''; let fetched = false; let note = null;
  if (typeof UrlFetchApp !== 'undefined') {
    try {
      const headers = { 'Accept-Language': 'vi,en;q=0.8', 'User-Agent': 'Mozilla/5.0 (compatible; Leeming/1.0)' };
      let cur = url;
      for (let i = 0; i < 6; i++) {
        const res = UrlFetchApp.fetch(cur, { followRedirects: false, muteHttpExceptions: true, headers: headers });
        const code = res.getResponseCode();
        const h = res.getHeaders();
        const loc = h.Location || h.location;
        if (code >= 300 && code < 400 && loc) {
          const next = /^https?:/i.test(loc) ? loc : cur.replace(/^(https?:\/\/[^/]+).*$/, '$1') + loc;
          if (!isMapsUrl_(next)) { note = 'Google chuyển sang trang khác, chỉ đọc được thông tin trong link.'; break; }
          cur = next; continue;
        }
        if (code === 200) { html = res.getContentText(); fetched = true; }
        break;
      }
      finalUrl = cur;
    } catch (e) {
      note = 'Không mở được link (' + (e && e.message ? e.message : e) + '), chỉ đọc được thông tin trong link.';
    }
  } else {
    note = 'Chế độ dùng thử không mở được link, chỉ đọc được thông tin trong link.';
  }
  const fromUrl = parseMapsUrl_(finalUrl);
  const fromPage = html ? parseMapsHtml_(html) : {};
  // Tâm bản đồ (@lat,lng) chỉ dùng khi trang không cho tọa độ ghim của quán.
  const usePage = fromPage.lat != null && (fromUrl.lat == null || fromUrl.coord_src === 'view');
  const lat = usePage ? fromPage.lat : fromUrl.lat;
  const lng = usePage ? fromPage.lng : fromUrl.lng;
  const name = fromPage.name || fromUrl.name || null;
  const typeText = fromPage.type_text || null;
  const names = categoriesOf_('restaurant').map((c) => c.name);
  const out = {
    ok_fetch: fetched, name: name, lat: lat, lng: lng, address: fromPage.address || null,
    type_text: typeText, category: guessRestaurantCategory_([typeText, name].filter(Boolean).join(' '), names),
    maps_url: parseMapsUrl_(url).short ? url : finalUrl, note: note
  };
  if (!out.name && out.lat == null) out.note = (out.note ? out.note + ' ' : '') + 'Không tìm thấy tên hay tọa độ trong link này.';
  return out;
}

// ───────────────────────── PHIÊN & KỶ NIỆM ─────────────────────────

/** Tạo mới hoặc cập nhật 1 phiên hỏi đáp.
 *  outcome: 'di_luon' (chọn quán từ gợi ý) | 'tu_tim' (Để bố tự tìm) | 'bo_do' (thoát giữa chừng) */
function saveSession_(s) {
  const data = Object.assign({}, s);
  if (data.context && typeof data.context !== 'string') data.context = contextForSave_(data.context);
  ['answers', 'rejected', 'context'].forEach((k) => { if (data[k] && typeof data[k] !== 'string') data[k] = JSON.stringify(data[k]); });
  if (data.id && findRow_(sheet_('sessions'), data.id) > 0) return update_('sessions', data.id, data);
  delete data.id;
  if (!data.started_at) data.started_at = nowIso_();
  return insert_('sessions', data);
}

/** payload:
 *  {
 *    meal: {date?, session_id?, source:'suggested'|'self', restaurant_id?, restaurant_name?, dish_id?, dish_name?,
 *           rating, tastes:[...], feeling},
 *    photo?: {base64, mimeType},            // ảnh đã nén ở client, base64 không kèm tiền tố data:
 *    newRestaurant?: {name, address, lat, lng, category, ...}   // khi "Để bố tự tìm" ở quán mới
 *  } */
function saveMeal_(p) {
  const meal = Object.assign({}, p.meal || {});
  if (!meal.date) meal.date = today_();
  // Điểm quán trong bữa này (4 tiêu chí như khi thêm quán): rating của bữa = trung bình cộng các tiêu chí có điểm.
  checkScores_(meal);
  const scored = Object.keys(RATING_WEIGHTS).filter((k) => isNum_(meal[k]));
  if (scored.length) meal.rating = Math.round(scored.reduce((sum, k) => sum + Number(meal[k]), 0) / scored.length * 100) / 100;
  // Món đã thử: kiểm tra hết trước khi ghi gì, để lỗi giữa chừng không để lại dữ liệu dở dang.
  const items = checkMealDishes_(p.dishes);
  if (Array.isArray(meal.tastes)) meal.tastes = meal.tastes.join(', ');
  // Tag ngữ cảnh: lấy từ meal.context_tags, hoặc từ context gửi kèm, hoặc từ phiên (session_id).
  if (!splitTags_(meal.context_tags).length) {
    let ctx = p.context ? contextForSave_(p.context) : null;
    if (!ctx && meal.session_id) {
      const ses = safeReadAll_('sessions').filter((x) => x.id === meal.session_id)[0];
      try { ctx = ses && ses.context ? JSON.parse(ses.context) : null; } catch (e) { ctx = null; }
    }
    if (ctx) {
      meal.context_tags = splitTags_(ctx.keys);
      if (meal.weather_temp == null && ctx.weather && isNum_(ctx.weather.temp)) meal.weather_temp = Number(ctx.weather.temp);
    }
  }
  if (Array.isArray(meal.context_tags)) meal.context_tags = meal.context_tags.join(', ');

  if (p.newRestaurant && p.newRestaurant.name) {
    // Quán mới tạo từ bữa ăn lấy luôn điểm bữa này làm điểm ban đầu (nếu không gửi riêng).
    const nr = Object.assign({}, p.newRestaurant);
    scored.forEach((k) => { if (!isNum_(nr[k])) nr[k] = meal[k]; });
    const r = createRecord_('restaurants', nr);
    meal.restaurant_id = r.id;
    meal.restaurant_name = r.name;
    meal.is_new_place = true;
  }
  if (meal.restaurant_id && !meal.restaurant_name) {
    const r = readAll_('restaurants', true).filter((x) => x.id === meal.restaurant_id)[0];
    if (r) meal.restaurant_name = r.name;
  }
  // Món mới tạo trong bữa → thêm vào sổ món; mọi món đã thử → gán vào quán nếu chưa có.
  items.forEach((x) => {
    if (x.newDish) {
      const d = createRecord_('dishes', x.newDish);
      x.dish_id = d.id; x.dish_name = d.name;
    }
  });
  if (meal.restaurant_id && items.length) linkMealDishes_(meal.restaurant_id, items);
  if (!meal.dish_id && items.length) { meal.dish_id = items[0].dish_id; meal.dish_name = items[0].dish_name; }
  if (meal.dish_id && !meal.dish_name) {
    const d = readAll_('dishes', true).filter((x) => x.id === meal.dish_id)[0];
    if (d) meal.dish_name = d.name;
  }
  if (meal.restaurant_id && meal.is_new_place === undefined) {
    meal.is_new_place = !readAll_('meals').some((m) => m.restaurant_id === meal.restaurant_id);
  }

  if (p.photo && p.photo.base64) {
    const saved = savePhoto_(p.photo, meal);
    meal.photo_url = saved.url;
    meal.photo_file_id = saved.id;
  }

  const saved = insert_('meals', meal);
  if (items.length) {
    saved.dishes = items.map((x) => insert_('mealDishes', {
      meal_id: saved.id, dish_id: x.dish_id, dish_name: x.dish_name, rating: x.rating, note: x.note
    }));
    if (meal.restaurant_id) recalcDishRatings_(meal.restaurant_id, items.map((x) => x.dish_id));
  } else {
    saved.dishes = [];
  }
  if (meal.session_id) {
    try {
      saveSession_({
        id: meal.session_id, ended_at: nowIso_(),
        final_dish_id: meal.dish_id || '', final_restaurant_id: meal.restaurant_id || '',
        outcome: meal.source === 'self' ? 'tu_tim' : 'di_luon'
      });
    } catch (e) { /* phiên không tồn tại thì bỏ qua */ }
  }
  return saved;
}

/** Ngữ cảnh gọn để lưu. Nhận bản đã suy ra (có keys) hoặc bản thô (thời tiết + mood + dịp) thì tự suy ra.
 *  Không lưu tọa độ. */
/** dishes: [{dish_id?, newDish?:{name, category, ...thuộc tính}, rating?, note?, price?}] → danh sách đã kiểm tra.
 *  Kèm dish_name cho món có sẵn. Món mới chưa được tạo ở bước này. */
function checkMealDishes_(list) {
  const items = (list || []).filter((x) => x && (x.dish_id || (x.newDish && String(x.newDish.name || '').trim())));
  if (!items.length) return [];
  const dMap = {}; readAll_('dishes').forEach((d) => { dMap[d.id] = d; });
  return items.map((x) => {
    const it = { rating: '', note: String(x.note || '').trim(), price: isNum_(x.price) ? Number(x.price) : '' };
    if (x.rating !== undefined && x.rating !== null && x.rating !== '') {
      const n = Number(x.rating);
      if (isNaN(n) || n < 1 || n > 5) throw new Error('Điểm món phải từ 1 đến 5');
      it.rating = n;
    }
    if (x.dish_id) {
      const d = dMap[x.dish_id];
      if (!d) throw new Error('Không tìm thấy món ' + x.dish_id + ' trong sổ');
      it.dish_id = d.id; it.dish_name = d.name;
    } else {
      const nd = Object.assign({}, x.newDish);
      nd.name = String(nd.name).trim();
      nd.category = checkCategory_('dishes', nd.category);
      it.newDish = nd;
    }
    return it;
  });
}

/** Gán các món vào quán (RestaurantDishes) nếu chưa có; có nhập giá mà liên kết đang trống giá thì điền vào. */
function linkMealDishes_(restaurantId, items) {
  const links = readAll_('restaurantDishes').filter((l) => l.restaurant_id === restaurantId);
  items.forEach((x) => {
    const l = links.filter((y) => y.dish_id === x.dish_id)[0];
    if (!l) links.push(insert_('restaurantDishes', { restaurant_id: restaurantId, dish_id: x.dish_id, price: x.price }));
    else if (x.price !== '' && !isNum_(l.price)) update_('restaurantDishes', l.id, { price: x.price });
  });
}

/** dish_rating của món tại quán = trung bình điểm món đó trong MealDishes các bữa (chưa xóa) ở quán này. */
function recalcDishRatings_(restaurantId, dishIds) {
  const mealIds = {};
  readAll_('meals').forEach((m) => { if (m.restaurant_id === restaurantId) mealIds[m.id] = true; });
  const sum = {};
  safeReadAll_('mealDishes').forEach((x) => {
    if (!mealIds[x.meal_id] || dishIds.indexOf(x.dish_id) < 0 || !isNum_(x.rating)) return;
    const s = sum[x.dish_id] || (sum[x.dish_id] = { t: 0, n: 0 });
    s.t += Number(x.rating); s.n++;
  });
  readAll_('restaurantDishes').forEach((l) => {
    if (l.restaurant_id !== restaurantId || !sum[l.dish_id]) return;
    update_('restaurantDishes', l.id, { dish_rating: round1_(sum[l.dish_id].t / sum[l.dish_id].n) });
  });
}

function contextForSave_(c) {
  if (!c) return null;
  if (Array.isArray(c.keys)) {
    return {
      mode: c.mode || null, keys: c.keys, weather: c.weather || null, moods: c.moods || [], occasions: c.occasions || [],
      time_bucket: c.time_bucket || null, location_source: c.location_source || null,
      radius_km: c.radius_km === undefined ? null : c.radius_km
    };
  }
  const data = {
    config: readConfig_(),
    contextRules: safeReadAll_('contextRules').filter((r) => r.active !== false && r.key)
  };
  const ctx = deriveContext_(data, c, c.now);
  const loc = isNum_(c.lat) && isNum_(c.lng) ? 'device' : (isNum_(data.config.home_lat) ? 'home' : 'none');
  return {
    mode: c.mode || 'ab', keys: ctx.keys, weather: ctx.weather, moods: ctx.moods, occasions: ctx.occasions,
    time_bucket: ctx.time_bucket, location_source: loc, radius_km: c.radius_km === undefined ? null : c.radius_km
  };
}

function photoFolder_() {
  const id = getConfigValue_('photo_folder_id');
  if (id) { try { return DriveApp.getFolderById(String(id)); } catch (e) { /* folder bị xóa, tạo lại */ } }
  const folder = DriveApp.createFolder(PHOTO_FOLDER_NAME);
  setConfigValue_('photo_folder_id', folder.getId());
  return folder;
}

function savePhoto_(photo, meal) {
  const mime = photo.mimeType || 'image/jpeg';
  const ext = mime.indexOf('png') >= 0 ? 'png' : 'jpg';
  const b64 = String(photo.base64).replace(/^data:[^,]+,/, '');
  const name = [meal.date, meal.dish_name || meal.restaurant_name || 'bua-an'].join('_').replace(/[\\/:*?"<>|]/g, '') + '.' + ext;
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, name);
  const file = photoFolder_().createFile(blob);
  // Ai có link mới xem được ảnh — cần để app hiển thị ảnh trên điện thoại.
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { id: file.getId(), url: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1200' };
}

/** payload: {from?:'yyyy-MM-dd', to?:'yyyy-MM-dd', limit?} — mới nhất trước. */
function getMeals_(p) {
  let meals = readAll_('meals');
  if (p.from) meals = meals.filter((m) => m.date >= p.from);
  if (p.to) meals = meals.filter((m) => m.date <= p.to);
  // Mới nhất trước; cùng ngày giờ (created_at chỉ tới giây) thì dòng ghi sau đứng trước.
  meals.forEach((m, i) => { m._row = i; });
  meals.sort((a, b) => String(b.date + b.created_at).localeCompare(String(a.date + a.created_at)) || b._row - a._row);
  meals.forEach((m) => { delete m._row; });
  if (p.limit) meals = meals.slice(0, Number(p.limit));
  // Kèm danh sách món đã thử của từng bữa (bữa cũ: mảng rỗng).
  const byMeal = {};
  mealDishesOf_(meals).forEach((x) => { (byMeal[x.meal_id] = byMeal[x.meal_id] || []).push(x); });
  meals.forEach((m) => { m.dishes = byMeal[m.id] || []; });
  return meals;
}

// ───────────────────────── THỐNG KÊ ─────────────────────────

/** payload: {month?:'yyyy-MM', tasteDays?:14} */
function getStats_(p) {
  const month = p.month || today_().slice(0, 7);
  const tasteDays = Number(p.tasteDays || 14);
  const allMeals = readAll_('meals');
  const dishes = readAll_('dishes', true);
  const attrs = dishAttrs_(headersOf_(sheet_('dishes'))).filter((a) => TASTE_ATTRS.indexOf(a) >= 0);
  const dMap = {}; dishes.forEach((d) => { dMap[d.id] = d; });
  const inMonth = allMeals.filter((m) => String(m.date || '').slice(0, 7) === month);

  // Quán mới: quán có bữa ăn đầu tiên rơi vào tháng này.
  const firstVisit = {};
  allMeals.forEach((m) => {
    if (m.restaurant_id && (!firstVisit[m.restaurant_id] || m.date < firstVisit[m.restaurant_id])) firstVisit[m.restaurant_id] = m.date;
  });
  const newPlaces = Object.keys(firstVisit).filter((id) => String(firstVisit[id]).slice(0, 7) === month).length
    + inMonth.filter((m) => m.is_new_place && !m.restaurant_id).length;

  // Món ăn lại nhiều nhất.
  // Mỗi bữa tính 1 lần cho mỗi món: món chính + các món đã thử (MealDishes).
  const dishCount = {};
  const triedByMeal = {};
  mealDishesOf_(inMonth).forEach((x) => { (triedByMeal[x.meal_id] = triedByMeal[x.meal_id] || []).push(x); });
  inMonth.forEach((m) => {
    const names = {};
    const main = m.dish_name || (dMap[m.dish_id] && dMap[m.dish_id].name);
    if (main) names[main] = true;
    (triedByMeal[m.id] || []).forEach((x) => {
      const n = x.dish_name || (dMap[x.dish_id] && dMap[x.dish_id].name);
      if (n) names[n] = true;
    });
    Object.keys(names).forEach((k) => { dishCount[k] = (dishCount[k] || 0) + 1; });
  });
  const topDishes = Object.keys(dishCount).map((k) => ({ name: k, times: dishCount[k] }))
    .sort((a, b) => b.times - a.times).slice(0, 5);

  // Khẩu vị N ngày gần nhất (tính đến cuối tháng đang xem, hoặc hôm nay).
  const monthEnd = lastDayOfMonth_(month);
  const endDay = monthEnd < today_() ? monthEnd : today_();
  const startNum = dayNum_(endDay) - tasteDays + 1;
  const recent = allMeals.filter((m) => m.date && dayNum_(m.date) >= startNum && dayNum_(m.date) <= dayNum_(endDay));
  const withDish = recent.filter((m) => dMap[m.dish_id]);
  const tasteProfile = attrs.map((a) => ({
    key: a, label: ATTR_LABELS[a] || a,
    percent: withDish.length ? Math.round(100 * withDish.filter((m) => toBool_(dMap[m.dish_id][a])).length / withDish.length) : 0
  })).sort((x, y) => y.percent - x.percent);

  const felt = {};
  recent.forEach((m) => String(m.tastes || '').split(',').map((s) => s.trim()).filter(Boolean)
    .forEach((t) => { felt[t] = (felt[t] || 0) + 1; }));

  // Số lần "Hông chịu" trung bình mỗi phiên trong tháng.
  const sessions = readAll_('sessions').filter((s) => String(s.started_at || '').slice(0, 7) === month);
  const rejects = sessions.map((s) => { try { return JSON.parse(s.rejected || '[]').length; } catch (e) { return 0; } });
  const avgRejects = rejects.length ? round1_(rejects.reduce((a, b) => a + b, 0) / rejects.length) : null;

  const weekdayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const byWeekday = weekdayNames.map((n) => ({ day: n, meals: 0 }));
  inMonth.forEach((m) => { const p2 = m.date.split('-').map(Number); byWeekday[new Date(Date.UTC(p2[0], p2[1] - 1, p2[2])).getUTCDay()].meals++; });

  const months = {};
  allMeals.forEach((m) => { if (m.date) months[String(m.date).slice(0, 7)] = true; });

  // "Leeming nhận ra…": mỗi ngữ cảnh đủ bữa → 3 thuộc tính chênh nhiều nhất so với bình thường.
  const allAttrs = dishAttrs_(headersOf_(sheet_('dishes')));
  const cst = contextAttrStats_(allMeals, dMap, allAttrs);
  const minMeals = cfgNum_(readConfig_(), 'learn_min_meals');
  const ruleMap = {};
  safeReadAll_('contextRules').forEach((r) => { if (r.key) ruleMap[String(r.key)] = r; });
  const base = cst[''];
  const contextInsights = Object.keys(cst).filter((t) => t && cst[t].n >= minMeals).map((t) => {
    const s = cst[t];
    const insights = allAttrs.map((a) => ({
      attr: a, label: ATTR_LABELS[a] || a,
      percent: Math.round(100 * (s.c[a] || 0) / s.n),
      baseline: base.n ? Math.round(100 * (base.c[a] || 0) / base.n) : 0
    })).filter((x) => Math.abs(x.percent - x.baseline) >= 10)
      .sort((x, y) => Math.abs(y.percent - y.baseline) - Math.abs(x.percent - x.baseline)).slice(0, 3);
    const r = ruleMap[t] || {};
    return { key: t, label: r.label || t, emoji: r.emoji || '', type: r.type || null, meals: s.n, insights: insights };
  }).filter((x) => x.insights.length).sort((a, b) => b.meals - a.meals);

  return {
    month: month,
    totalMeals: inMonth.length,
    newPlaces: newPlaces,
    avgRejects: avgRejects,
    sessionsCount: sessions.length,
    topDishes: topDishes,
    tasteProfile: tasteProfile,
    tasteWindow: { days: tasteDays, until: endDay, meals: withDish.length },
    feltTastes: Object.keys(felt).map((k) => ({ label: k, times: felt[k] })).sort((a, b) => b.times - a.times),
    byWeekday: byWeekday,
    photos: inMonth.filter((m) => m.photo_url).map((m) => ({ id: m.id, date: m.date, url: m.photo_url, dish_name: m.dish_name, restaurant_name: m.restaurant_name })),
    availableMonths: Object.keys(months).sort().reverse(),
    contextInsights: contextInsights,
    contextMinMeals: minMeals
  };
}

function lastDayOfMonth_(month) {
  const p = month.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1], 0));
  return month + '-' + String(d.getUTCDate()).padStart(2, '0');
}

// ───────────────────────── TIỆN ÍCH ─────────────────────────

function nowIso_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function round1_(x) { return Math.round(x * 10) / 10; }
function newId_(prefix) { return (prefix ? prefix + '-' : '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8); }

// ───────────────────────── KHỞI TẠO & MENU ─────────────────────────

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Leeming')
    .addItem('Khởi tạo / bổ sung sheet', 'setupSheets')
    .addItem('Nâng cấp dữ liệu lên V2', 'migrateSchemaV2')
    .addItem('Kiểm tra & sửa tọa độ quán', 'fixCoordinates')
    .addItem('Đồng bộ danh sách phân loại', 'syncCategories')
    .addItem('Xem mã truy cập', 'showToken')
    .addItem('Tạo lại mã truy cập', 'resetToken')
    .addSeparator()
    .addItem('Chạy thử API', 'testApi')
    .addToUi();
}

/** Tạo sheet và cột còn thiếu. Không xóa dữ liệu, cột mới được thêm vào cuối. */
function ensureSheets_() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(TABLES).forEach((t) => {
    const def = TABLES[t];
    let sh = ss.getSheetByName(def.sheet);
    if (!sh) sh = ss.insertSheet(def.sheet);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers])
        .setFontWeight('bold').setBackground('#FFE1D2').setFontColor('#2A1B14');
      sh.setFrozenRows(1);
    } else {
      const existing = headersOf_(sh);
      def.headers.filter((h) => existing.indexOf(h) < 0).forEach((h) => {
        sh.getRange(1, sh.getLastColumn() + 1).setValue(h).setFontWeight('bold').setBackground('#FFE1D2');
      });
    }
    // Cột ngày của dịp đặc biệt để dạng chữ, tránh Sheet tự đổi "10-20" thành ngày của năm nay.
    if (t === 'contextRules') {
      const col = headersOf_(sh).indexOf('date') + 1;
      // Chỉ trong số dòng sheet đang có: Sheets báo lỗi nếu vùng vượt quá kích thước sheet (sheet mới có 1000 dòng).
      if (col > 0 && sh.getMaxRows() > 1) sh.getRange(2, col, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    }
  });
  const blank = ss.getSheetByName('Sheet1') || ss.getSheetByName('Trang tính1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
}

/** Chạy 1 lần: tạo các sheet, tiêu đề cột, dữ liệu mẫu và mã truy cập. Chạy lại không làm mất dữ liệu. */
function setupSheets() {
  const ss = SpreadsheetApp.getActive();
  ensureSheets_();
  ensureConfigKeys_();
  seedSampleData_();

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('API_TOKEN')) props.setProperty('API_TOKEN', generateToken_());
  console.log('Đã khởi tạo xong. Mã truy cập: ' + props.getProperty('API_TOKEN'));
  try { ss.toast('Đã khởi tạo xong. Xem mã truy cập ở menu Leeming.', 'Leeming', 8); } catch (e) { /* chạy từ editor */ }
}

// ───────────────────────── NÂNG CẤP V2 ─────────────────────────

/** Chạy 1 lần sau khi dán Code.gs bản V2. Chạy lại cũng an toàn: chỉ điền chỗ còn trống. */
function migrateSchemaV2() {
  return withLock_(() => {
    ensureSheets_();
    const cats = syncCategories_();
    const dishes = migrateDishesV2_();
    const shops = migrateRestaurantsV2_();
    const msg = 'Nâng cấp V2 xong: thêm ' + cats + ' phân loại, đoán thuộc tính cho ' + dishes + ' món, tính lại điểm ' + shops + ' quán.';
    console.log(msg);
    try { SpreadsheetApp.getActive().toast(msg, 'Leeming', 10); } catch (e) { /* chạy từ editor */ }
    return { categoriesAdded: cats, dishesGuessed: dishes, restaurantsRated: shops };
  });
}

/** Món có mọi cột thuộc tính V2 còn trống thì đoán từ tên + phân loại. Trả về số món đã đoán. */
function migrateDishesV2_() {
  const sh = sheet_('dishes');
  const headers = headersOf_(sh);
  const lastRow = sh.getLastRow();
  const attrs = dishAttrs_(headers);
  const rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  if (lastRow < 2) return 0;
  const values = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const cols = V2_DISH_ATTRS.map((a) => headers.indexOf(a)).filter((i) => i >= 0);
  let n = 0;
  values.forEach((row) => {
    if (!row.some((c) => c !== '' && c !== null)) return;
    if (!cols.every((i) => row[i] === '' || row[i] === null)) return;
    const d = {}; headers.forEach((h, i) => { d[h] = row[i]; });
    const g = guessDishAttrsV2_(d);
    cols.forEach((i) => { row[i] = g[headers[i]] === true; });
    n++;
  });
  cols.forEach((i) => sh.getRange(2, i + 1, values.length, 1).setValues(values.map((r) => [r[i] === '' ? false : toBool_(r[i])])));
  attrs.forEach((a) => sh.getRange(2, headers.indexOf(a) + 1, values.length, 1).setDataValidation(rule));
  return n;
}

function hasAny_(text, words) {
  const t = ' ' + String(text || '').toLowerCase().replace(/[^0-9a-zà-ỹđ]+/g, ' ') + ' ';
  return words.some((w) => t.indexOf(' ' + w + ' ') >= 0);
}

/** Đoán thuộc tính V2 (nền ẩm thực, thành phần, đồ lạnh, đồ chay) từ tên + phân loại món. */
function guessDishAttrsV2_(d) {
  const name = String(d.name || '');
  const cat = String(d.category || '').trim();
  const out = {};
  const drinkCats = ['Đồ uống', 'Cà phê', 'Cà phê mèo', 'Trà sữa', 'Pub/Bar'];
  const isDrink = drinkCats.indexOf(cat) >= 0 || hasAny_(name, ['trà sữa', 'cà phê', 'cafe', 'coffee', 'sinh tố', 'nước ép', 'bia', 'cocktail', 'trà']);
  const cuisineByCat = { 'Đồ Hàn': 'do_han', 'Đồ Thái': 'do_thai', 'Đồ Nhật': 'do_nhat', 'Đồ Âu': 'do_au', 'Đồ Hoa': 'do_trung' };
  let cuisine = cuisineByCat[cat] || null;
  if (!cuisine) {
    if (hasAny_(name, ['sushi', 'sashimi', 'ramen', 'udon', 'tempura', 'takoyaki', 'nhật'])) cuisine = 'do_nhat';
    else if (hasAny_(name, ['kimchi', 'tokbokki', 'tteokbokki', 'bibimbap', 'kimbap', 'hàn', 'hàn quốc'])) cuisine = 'do_han';
    else if (hasAny_(name, ['thái', 'tom yum', 'tomyum', 'pad thai'])) cuisine = 'do_thai';
    else if (hasAny_(name, ['pizza', 'pasta', 'spaghetti', 'burger', 'hamburger', 'steak', 'bít tết', 'salad', 'sandwich'])) cuisine = 'do_au';
    else if (hasAny_(name, ['dimsum', 'há cảo', 'sủi cảo', 'xíu mại', 'vằn thắn', 'hoành thánh', 'mì vịt tiềm', 'lẩu tứ xuyên'])) cuisine = 'do_trung';
    else if (!isDrink) cuisine = 'do_viet';
  }
  if (cuisine) out[cuisine] = true;

  if (hasAny_(name, ['bò', 'bê'])) out.tp_bo = true;
  if (hasAny_(name, ['gà'])) out.tp_ga = true;
  if (hasAny_(name, ['vịt'])) out.tp_vit = true;
  if (hasAny_(name, ['ngan'])) out.tp_ngan = true;
  if (hasAny_(name, ['lợn', 'heo', 'sườn', 'nem', 'chả', 'bún chả', 'xá xíu', 'ba chỉ', 'giò', 'pate', 'lòng', 'dồi', 'cơm tấm', 'thịt xiên', 'thịt nướng'])) out.tp_lon = true;
  if (hasAny_(name, ['cá'])) out.tp_ca = true;
  if (hasAny_(name, ['ốc', 'tôm', 'ghẹ', 'cua', 'mực', 'hàu', 'sò', 'ngao', 'hến', 'hải sản', 'bạch tuộc', 'riêu']) || cat === 'Ốc') out.tp_haisan = true;
  if (hasAny_(name, ['trứng', 'ốp la'])) out.tp_trung = true;
  if (hasAny_(name, ['chay'])) out.chay = true;

  const cold = isDrink || cat === 'Tráng miệng' || hasAny_(name, ['kem', 'chè', 'sữa chua', 'đá', 'lạnh', 'trà sữa', 'sinh tố', 'nộm', 'gỏi']);
  if (cold && !toBool_(d.nong)) out.lanh = true;
  return out;
}

/** Quán chưa có điểm Chất lượng thì lấy rating cũ, sau đó tính lại rating cho mọi dòng. Trả về số quán có điểm. */
function migrateRestaurantsV2_() {
  const sh = sheet_('restaurants');
  const headers = headersOf_(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  const range = sh.getRange(2, 1, lastRow - 1, headers.length);
  const values = range.getValues();
  const qi = headers.indexOf('quality'); const ri = headers.indexOf('rating');
  let n = 0;
  values.forEach((row) => {
    const o = {}; headers.forEach((h, i) => { o[h] = row[i]; });
    if (!isNum_(o.quality) && isNum_(o.rating)) { o.quality = Number(o.rating); row[qi] = o.quality; }
    const r = calcRating_(o);
    row[ri] = r == null ? '' : r;
    if (r != null) n++;
  });
  sh.getRange(2, qi + 1, values.length, 1).setValues(values.map((r) => [r[qi]]));
  sh.getRange(2, ri + 1, values.length, 1).setValues(values.map((r) => [r[ri]]));
  return n;
}

/** Thêm các khóa Config còn thiếu (giữ nguyên giá trị đã có). */
function ensureConfigKeys_() {
  const sh = sheet_('config');
  const have = {};
  const last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, 1).getValues().forEach((r) => { have[String(r[0]).trim()] = true; });
  const missing = CONFIG_DEFAULTS.filter((c) => !have[c[0]]);
  if (missing.length) {
    sh.getRange(sh.getLastRow() + 1, 1, missing.length, 3)
      .setValues(missing.map((r) => r.map((v) => (v === '' ? '' : "'" + v))));
  }
  return missing.length;
}

/** Luật ngữ cảnh mẫu — chủ app tự chỉnh trong sheet ContextRules. */
function seedContextRules_() {
  const rows = [
    // type, key, label, emoji, rule, price_bias, novelty_bias, message, date
    ['weather', 'rain', 'Trời mưa', '🌧️', 'nuoc=2;nong=2;cay=1;an_no=1', 0, 0, 'Trời mưa rồi, làm bát gì nóng hổi có nước cho ấm bụng nha Cá.', ''],
    ['weather', 'cold', 'Trời lạnh', '🥶', 'nuoc=2;nong=2;cay=1;beo=1;an_no=1', 0, 0, 'Lạnh thế này phải ăn gì nóng nóng, béo béo mới chịu nổi.', ''],
    ['weather', 'cool', 'Trời mát', '🌤️', 'nong=1;nuoc=1', 0, 0, 'Trời mát dễ chịu, ăn gì cũng ngon, món ấm ấm càng hợp.', ''],
    ['weather', 'hot', 'Trời nóng', '☀️', 'nong=-1;chua=1;nuoc=1', 0, 0, 'Nóng quá, Leeming chọn món nhẹ nhàng thanh mát cho Cá.', ''],
    ['weather', 'hot_humid', 'Nóng oi bức', '🥵', 'nong=-2;lanh=2;chua=2;cay=-1;beo=-1;nuoc=1', 0, 0, 'Trời oi bức, né đồ nóng với đồ béo ra nha Cá.', ''],
    ['time', 'morning', 'Sáng', '🌅', 'nuoc=1;nong=1', 0, 0, 'Bữa sáng ăn gì có nước ấm ấm là đẹp.', ''],
    ['time', 'noon', 'Trưa', '🍚', 'an_no=1', 0, 0, 'Trưa rồi, ăn cho no để chiều còn sức.', ''],
    ['time', 'afternoon', 'Chiều', '🧋', 'an_vat=1', 0, 0, 'Chiều chiều nhâm nhi chút gì là vui.', ''],
    ['time', 'evening', 'Tối', '🌆', '', 0, 0, '', ''],
    ['time', 'late_night', 'Khuya', '🌙', 'an_vat=2', 0, 0, 'Khuya rồi, ăn vặt chút thôi nha Cá.', ''],
    ['mood', 'tired', 'Mệt rã rời', '😮‍💨', 'an_no=2;nong=1;beo=1', 0, 0, 'Cá mệt rồi, ăn gì no bụng nạp năng lượng nha.', ''],
    ['mood', 'stress', 'Stress', '🤯', 'cay=2;ngot=1', 0, 0, 'Stress thì ăn cay xả hơi, thêm tí ngọt cho vui.', ''],
    ['mood', 'happy', 'Vui', '😄', 'an_no=1', 1, 0, 'Đang vui thì ăn ngon một bữa cho trọn vẹn!', ''],
    ['mood', 'sad', 'Buồn', '🥺', 'ngot=2;beo=1;nong=1', 0, 0, 'Buồn thì để đồ ngọt với đồ ấm dỗ Cá nè.', ''],
    ['mood', 'excited', 'Hứng khởi', '🤩', 'cay=1', 0, 1, 'Đang hứng khởi, thử món mới cho máu nha!', ''],
    ['mood', 'sick', 'Hơi ốm', '🤒', 'nuoc=2;nong=2;cay=-2;beo=-1', 0, 0, 'Cá hơi ốm, ăn đồ nóng có nước, đừng ăn cay nha.', ''],
    ['mood', 'crave_new', 'Thèm gì đó lạ', '🧭', '', 0, 1, 'Cá thèm lạ miệng nên Leeming chọn món ít ăn.', ''],
    ['occasion', 'birthday_ca', 'Sinh nhật Cá', '🎂', 'an_no=1', 1, 0, 'Sinh nhật Cá mà, phải ăn món xịn!', ''],
    ['occasion', 'anniversary', 'Ngày kỷ niệm', '💞', '', 1, 0, 'Ngày kỷ niệm của hai đứa, đi ăn chỗ ngon nha.', ''],
    ['occasion', 'womens_day_vn', '20/10', '💐', '', 1, 0, 'Hôm nay 20/10, Cá được chiều nhất nhà!', '10-20'],
    ['occasion', 'intl_womens_day', '8/3', '🌷', '', 1, 0, 'Mùng 8/3 rồi, Cá chọn gì cũng được hết.', '03-08'],
    ['occasion', 'valentine', 'Valentine', '💘', '', 1, 0, 'Valentine nè, đi ăn chỗ lãng mạn xíu nha.', '02-14'],
    ['occasion', 'celebrate', 'Ăn mừng', '🎉', '', 1, 0, 'Ăn mừng thì phải ăn ngon!', '']
  ];
  rows.forEach((r, i) => insert_('contextRules', {
    type: r[0], key: r[1], label: r[2], emoji: r[3], rule: r[4], price_bias: r[5], novelty_bias: r[6],
    message: r[7], date: r[8], active: true, sort_order: i + 1
  }));
  return rows.length;
}

function generateToken_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

function showToken() {
  const t = PropertiesService.getScriptProperties().getProperty('API_TOKEN') || '(chưa có — hãy chạy setupSheets)';
  console.log('Mã truy cập: ' + t);
  try { SpreadsheetApp.getUi().alert('Mã truy cập API của app:\n\n' + t); } catch (e) { /* chạy từ editor */ }
}

function resetToken() {
  PropertiesService.getScriptProperties().setProperty('API_TOKEN', generateToken_());
  showToken();
}

function seedSampleData_() {
  // Luôn đồng bộ: thêm phân loại mặc định và mọi phân loại quán/món đang dùng mà danh sách còn thiếu.
  syncCategories_();
  if (readAll_('contextRules').length === 0) seedContextRules_();

  if (readAll_('questions').length === 0) {
    [
      [1, 'Hôm nay bụng muốn…', 'Có nước, húp xì xụp', 'nuoc=TRUE', 'Khô ráo, gắp gắp', 'kho=TRUE'],
      [2, 'Còn vị thì sao?', 'Cay xé lưỡi', 'cay=TRUE', 'Thanh thanh nhẹ nhàng', 'cay=FALSE'],
      [3, 'Đói cỡ nào rồi?', 'Đói meo, ăn no căng', 'an_no=TRUE', 'Ăn chơi, nhâm nhi', 'an_vat=TRUE'],
      [4, 'Ngọt ngào hay mặn mà?', 'Ngọt ngào', 'ngot=TRUE', 'Mặn mà đậm đà', 'man=TRUE'],
      [5, 'Béo ngậy hay thanh mát?', 'Béo ngậy', 'beo=TRUE', 'Thanh mát', 'beo=FALSE'],
      [6, 'Nóng hổi hay mát lạnh?', 'Nóng hổi', 'nong=TRUE', 'Mát lạnh', 'lanh=TRUE'],
      [7, 'Hôm nay ăn kiểu gì?', 'Đồ Việt cho chắc bụng', 'do_viet=TRUE', 'Đổi gió món ngoại', 'do_viet=FALSE']
    ].forEach((q) => insert_('questions', {
      sort_order: q[0], text: q[1], option_a: q[2], rule_a: q[3], option_b: q[4], rule_b: q[5], active: true
    }));
  }

  if (readAll_('dishes').length === 0) {
    const sample = [
      ['Phở bò', 'Bún/Phở', 'nuoc nong an_no man do_viet tp_bo'],
      ['Bún chả', 'Bún/Phở', 'nuoc ngot beo nong an_no do_viet tp_lon'],
      ['Bún bò Huế', 'Bún/Phở', 'nuoc cay nong an_no man do_viet tp_bo tp_lon'],
      ['Bún riêu', 'Bún/Phở', 'nuoc chua nong an_no do_viet tp_haisan'],
      ['Cơm tấm', 'Cơm', 'kho beo man an_no nong do_viet tp_lon tp_trung'],
      ['Mì trộn cay', 'Mì', 'kho cay an_no nong do_han tp_trung'],
      ['Bánh cuốn', 'Bánh', 'kho nong do_viet tp_lon'],
      ['Lẩu thái', 'Lẩu', 'nuoc cay chua nong an_no do_thai tp_haisan'],
      ['Nem chua rán', 'Ăn vặt', 'kho beo chua nong an_vat do_viet tp_lon'],
      ['Ốc luộc', 'Ốc', 'nuoc cay nong an_vat do_viet tp_haisan'],
      ['Bánh mì pate', 'Bánh', 'kho beo man an_vat do_viet tp_lon'],
      ['Gà rán', 'Gà rán', 'kho beo man nong an_no do_au tp_ga'],
      ['Chè', 'Tráng miệng', 'nuoc ngot lanh an_vat do_viet chay'],
      ['Trà sữa', 'Đồ uống', 'ngot beo lanh an_vat']
    ];
    const ids = {};
    sample.forEach((s) => {
      const data = { name: s[0], category: s[1] };
      const on = s[2].split(' ');
      DISH_ATTRS.forEach((a) => { data[a] = on.indexOf(a) >= 0; });
      ids[s[0]] = createRecord_('dishes', data).id;
    });

    if (readAll_('restaurants').length === 0) {
      const r1 = createRecord_('restaurants', {
        name: '[Mẫu] Quán phở đầu ngõ', category: 'Bún/Phở', address: '[Địa chỉ]', lat: 21.0285, lng: 105.8542,
        open_time: '06:00', close_time: '22:00', open_days: '', price_min: 40000, price_max: 70000,
        quality: 4.5, price_score: 4, space: 3.5, service: 4,
        comment: 'Dữ liệu mẫu — sửa hoặc xóa đi nhé'
      });
      const r2 = createRecord_('restaurants', {
        name: '[Mẫu] Quán bún chả', category: 'Bún/Phở', address: '[Địa chỉ]', lat: 21.0333, lng: 105.8490,
        open_time: '10:00', close_time: '20:00', open_days: 'T2-CN', price_min: 40000, price_max: 60000,
        quality: 4.5, price_score: 4.5, space: 3, service: 4,
        comment: 'Dữ liệu mẫu'
      });
      const r3 = createRecord_('restaurants', {
        name: '[Mẫu] Quán ăn đêm', category: 'Nhậu', address: '[Địa chỉ]', lat: 21.0245, lng: 105.8412,
        open_time: '17:00', close_time: '02:00', open_days: '', price_min: 50000, price_max: 150000,
        quality: 4, price_score: 3.5, space: 4, service: 3,
        comment: 'Dữ liệu mẫu — quán mở qua đêm'
      });
      [
        [r1.id, ids['Phở bò'], 55000], [r1.id, ids['Bún riêu'], 45000], [r1.id, ids['Bánh cuốn'], 35000],
        [r2.id, ids['Bún chả'], 50000], [r2.id, ids['Bún bò Huế'], 50000], [r2.id, ids['Cơm tấm'], 55000],
        [r3.id, ids['Ốc luộc'], 80000], [r3.id, ids['Nem chua rán'], 50000], [r3.id, ids['Lẩu thái'], 200000],
        [r3.id, ids['Mì trộn cay'], 45000], [r3.id, ids['Bánh mì pate'], 25000], [r3.id, ids['Chè'], 25000],
        [r3.id, ids['Phở bò'], 50000], [r3.id, ids['Gà rán'], 60000], [r3.id, ids['Trà sữa'], 30000]
      ].forEach((l) => insert_('restaurantDishes', { restaurant_id: l[0], dish_id: l[1], price: l[2] }));
    }
  }
}

/** Chạy thử toàn bộ luồng gợi ý mà không cần deploy. Xem kết quả ở Execution log. */
function testApi() {
  const data = bootstrap_();
  console.log('Quán: %s · Món: %s · Câu hỏi: %s', data.restaurants.length, data.dishes.length, data.questions.length);

  const answers = []; const rejected = [];
  for (let i = 0; i < 3; i++) {
    const q = nextQuestion_(data, { answers: answers, rejected: rejected }).question;
    if (!q) break;
    const choice = Math.random() < 0.5 ? 'A' : 'B';
    answers.push({ question_id: q.id, choice: choice });
    const s = suggestDish_(data, { answers: answers, rejected: rejected });
    console.log('Hỏi: "%s" → chọn %s (%s) → gợi ý: %s (còn %s món%s)', q.text, choice,
      choice === 'A' ? q.option_a : q.option_b, s.dish ? s.dish.name : '—', s.candidates,
      s.relaxed.length ? ', đã bỏ điều kiện: ' + s.relaxed.join(' | ') : '');
    if (s.dish && i < 2) rejected.push(s.dish.id); // giả lập "Hông chịu"
    if (s.dish && i === 2) {
      const r = suggestRestaurants_(data, { dish_id: s.dish.id });
      console.log('Quán đang mở cho %s: %s', s.dish.name, r.open.map((x) =>
        x.name + (x.is_best ? ' [Ngon nhất]' : '') + (x.is_nearest ? ' [Gần nhất]' : '') + (x.distance_km != null ? ' ' + x.distance_km + 'km' : '')).join(', ') || '(không có)');
      if (r.closed.length) console.log('Đang đóng: %s', r.closed.map((x) => x.name).join(', '));
    }
  }
  console.log('Thống kê tháng này: %s', JSON.stringify(getStats_({})).slice(0, 500));

  // Lưu kỷ niệm kiểu mới (4 điểm quán + món đã thử, có 1 món mới) rồi dọn sạch.
  testSaveMeal_();

  // Gợi ý nhanh theo ngữ cảnh: so sánh phân bố món của 3 kịch bản với không có ngữ cảnh.
  const yr = today_().slice(0, 4);
  const scenarios = [
    ['Không ngữ cảnh (A/B)', null],
    ['Mưa + mệt', { weather: { temp: 24, humidity: 85, precip: 1.2 }, moods: ['tired'], hour: 19 }],
    ['Nóng oi + khuya', { weather: { temp: 33, humidity: 80 }, hour: 23 }],
    ['20/10, không mood', { now: yr + '-10-20T12:00:00+07:00' }]
  ];
  scenarios.forEach((sc) => {
    const r = simulateSuggest_(data, sc[1], 500, sc[1] ? sc[1].now : null);
    console.log('%s → %s', sc[0], r.top.map((x) => x.name + ' ' + x.percent + '%').join(', '));
    if (sc[1]) {
      const q = suggestQuick_(data, { context: sc[1], now: sc[1].now });
      console.log('   gợi ý nhanh: %s · lý do: %s', q.dish ? q.dish.name : '—', q.reasons.join(' | '));
    }
  });
}

/** Thử saveMeal với 4 điểm quán + 1 món có sẵn + 1 món mới, in kết quả rồi XÓA SẠCH những gì vừa tạo
 *  và trả lại dish_rating cũ, để chạy trên Sheet thật cũng không để lại dữ liệu thử. */
function testSaveMeal_() {
  const data = bootstrap_();
  const r = data.restaurants[0];
  const old = data.dishes[0];
  if (!r || !old) { console.log('saveMeal: cần ít nhất 1 quán và 1 món để thử'); return null; }
  const linksBefore = readAll_('restaurantDishes').filter((l) => l.restaurant_id === r.id);
  const created = { meal: null, mealDishes: [], dish: null, links: [] };
  try {
    const m = saveMeal_({
      meal: { source: 'self', restaurant_id: r.id, quality: 5, price_score: 4, space: 3, service: 4, feeling: '[Thử testApi]' },
      dishes: [
        { dish_id: old.id, rating: 4, note: 'món có sẵn' },
        { newDish: { name: '[Thử testApi] Món mới', category: old.category || '', cay: true }, rating: 5, note: 'món mới' }
      ]
    });
    created.meal = m.id;
    created.mealDishes = m.dishes.map((x) => x.id);
    created.dish = m.dishes[1].dish_id;
    created.links = readAll_('restaurantDishes').filter((l) => l.restaurant_id === r.id
      && !linksBefore.some((b) => b.id === l.id)).map((l) => l.id);
    const after = bootstrap_();
    const link = (id) => after.restaurantDishes.filter((l) => l.restaurant_id === r.id && l.dish_id === id)[0];
    console.log('saveMeal mới: điểm bữa %s (TB 4 tiêu chí 5/4/3/4) · quán %s: điểm %s, TB tiêu chí %s',
      m.rating, r.name, after.restaurants.filter((x) => x.id === r.id)[0].score,
      JSON.stringify(after.restaurants.filter((x) => x.id === r.id)[0].meal_avg));
    console.log('   món đã thử: %s', m.dishes.map((x) => x.dish_name + ' ' + x.rating + '★').join(', '));
    console.log('   gán vào quán: %s (dish_rating %s) · %s (dish_rating %s) · getMeals trả %s món',
      old.name, link(old.id) ? link(old.id).dish_rating : '—', '[Thử testApi] Món mới',
      link(created.dish) ? link(created.dish).dish_rating : '—',
      getMeals_({ limit: 50 }).filter((x) => x.id === m.id)[0].dishes.length);
    return m;
  } finally {
    // Dọn: xóa hẳn các dòng vừa tạo, trả dish_rating của các liên kết cũ về như trước.
    const hardDelete = (table, id) => { const sh = sheet_(table); const row = findRow_(sh, id); if (row > 0) sh.deleteRow(row); };
    created.mealDishes.forEach((id) => hardDelete('mealDishes', id));
    if (created.meal) hardDelete('meals', created.meal);
    created.links.forEach((id) => hardDelete('restaurantDishes', id));
    if (created.dish) hardDelete('dishes', created.dish);
    linksBefore.forEach((l) => update_('restaurantDishes', l.id, { dish_rating: l.dish_rating == null ? '' : l.dish_rating }));
    console.log('   (đã dọn dữ liệu thử)');
  }
}

/** Chạy chọn món n lần (không hỏi A/B) để xem ngữ cảnh làm nghiêng phân bố thế nào.
 *  context = null → cơ chế cũ (dishWeight_ không ngữ cảnh). Trả về tỉ lệ từng món + tỉ lệ món có từng thuộc tính. */
function simulateSuggest_(data, context, n, at) {
  const now = at || (context && context.now);
  const ctx = context ? buildContext_(data, { context: context, now: now }, 'quick') : null;
  const pool = filterDishes_(data, [], [], now).candidates;
  const count = {}; const attr = {};
  for (let i = 0; i < n; i++) {
    const d = weightedPick_(pool, (x) => dishWeight_(x, ctx));
    count[d.id] = (count[d.id] || 0) + 1;
    DISH_ATTRS.forEach((a) => { if (toBool_(d[a])) attr[a] = (attr[a] || 0) + 1; });
  }
  const name = {}; data.dishes.forEach((d) => { name[d.id] = d.name; });
  const top = Object.keys(count).map((id) => ({ id: id, name: name[id], percent: Math.round(100 * count[id] / n) }))
    .sort((x, y) => y.percent - x.percent).slice(0, 5);
  const attrPct = {}; Object.keys(attr).forEach((a) => { attrPct[a] = Math.round(100 * attr[a] / n); });
  return { top: top, count: count, attrPercent: attrPct, pool: pool.length };
}
