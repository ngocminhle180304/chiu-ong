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
      'created_at', 'updated_at'],
    num: [],
    bool: []
  },
  meals: {
    sheet: 'Meals', prefix: 'M', soft: true,
    headers: ['id', 'date', 'session_id', 'source', 'restaurant_id', 'restaurant_name', 'dish_id', 'dish_name', 'rating',
      'tastes', 'feeling', 'photo_url', 'photo_file_id', 'is_new_place', 'created_at', 'updated_at', 'deleted'],
    num: ['rating'],
    bool: ['is_new_place', 'deleted']
  },
  categories: {
    sheet: 'Categories', prefix: 'C', soft: false,
    headers: ['id', 'type', 'name', 'sort_order', 'created_at', 'updated_at'],
    num: ['sort_order'],
    bool: []
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
  ping: () => ({ app: getConfigValue_('app_name') || 'Chìu ông hông bíc ăn gì', time: nowIso_() }),
  bootstrap: () => bootstrap_(),
  create: (p) => { assertCrud_(p.table); return withLock_(() => createRecord_(p.table, p.data || {})); },
  update: (p) => { assertCrud_(p.table); return withLock_(() => updateRecord_(p.table, p.id, p.data || {})); },
  remove: (p) => { assertCrud_(p.table); return withLock_(() => removeRecord_(p.table, p.id, p)); },
  linkDishes: (p) => withLock_(() => linkDishes_(p)),
  nextQuestion: (p) => nextQuestion_(bootstrap_(), p),
  suggestDish: (p) => suggestDish_(bootstrap_(), p),
  suggestRestaurants: (p) => suggestRestaurants_(bootstrap_(), p),
  saveSession: (p) => withLock_(() => saveSession_(p.session || p)),
  saveMeal: (p) => withLock_(() => saveMeal_(p)),
  getMeals: (p) => getMeals_(p),
  getStats: (p) => getStats_(p)
};

/** Action chỉ đọc — được phép gọi bằng GET (tiện để test trên trình duyệt). */
const READ_ACTIONS = ['ping', 'bootstrap', 'nextQuestion', 'suggestDish', 'suggestRestaurants', 'getMeals', 'getStats'];

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

function fromCell_(h, v, boolCols, numCols) {
  if (boolCols.indexOf(h) >= 0) return toBool_(v);
  if (v === '' || v == null) return null;
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
  if (table === 'questions' && row.active === undefined) row.active = true;
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
  if (table === 'restaurants') { checkScores_(data); data.rating = calcRating_(data); }
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

  const agg = (key) => {
    const m = {};
    meals.forEach((x) => {
      const id = x[key];
      if (!id) return;
      const s = m[id] || (m[id] = { n: 0, sum: 0, cnt: 0, last: null });
      s.n++;
      if (x.rating) { s.sum += Number(x.rating); s.cnt++; }
      if (x.date && (!s.last || x.date > s.last)) s.last = x.date;
    });
    return m;
  };
  const rStat = agg('restaurant_id');
  const dStat = agg('dish_id');

  restaurants.forEach((r) => {
    const s = rStat[r.id];
    r.visit_count = s ? s.n : 0;
    r.meal_rating_avg = s && s.cnt ? round1_(s.sum / s.cnt) : null;
    r.last_visit = s ? s.last : null;
    // Điểm dùng để xếp hạng "Ngon nhất": ưu tiên điểm từ các bữa đã ăn, nếu chưa có thì dùng rating nhập tay.
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

  const config = readConfig_();
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
    config: config,
    serverTime: nowIso_()
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
function dishWeight_(d) {
  const base = d.avg_rating != null ? d.avg_rating : 3.5;
  const days = daysSince_(d.last_eaten);
  const recency = days == null ? 1 : Math.min(1, Math.max(0.15, days / 14));
  return Math.max(0.05, base * recency);
}

function weightedPick_(items, weightFn) {
  const total = items.reduce((s, x) => s + weightFn(x), 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) { r -= weightFn(items[i]); if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

/** payload: {answers:[{question_id, choice}], rejected:[dish_id], now?} */
function suggestDish_(data, p) {
  const f = filterDishes_(data, p.answers, p.rejected, p.now);
  if (!f.candidates.length) return { dish: null, candidates: 0, relaxed: f.relaxed, exhausted: true };
  const dish = weightedPick_(f.candidates, dishWeight_);
  return { dish: dish, candidates: f.candidates.length, relaxed: f.relaxed, exhausted: false };
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

/** payload: {dish_id, lat?, lng?}. Không có vị trí thì dùng home_lat/home_lng trong Config. */
function suggestRestaurants_(data, p) {
  if (!p.dish_id) throw new Error('Thiếu dish_id');
  const now = p.now ? new Date(p.now) : new Date();
  let lat = p.lat; let lng = p.lng; let locationSource = 'device';
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

  const dish = data.dishes.filter((d) => d.id === p.dish_id)[0] || null;
  return {
    dish: dish,
    open: open,
    closed: list.filter((r) => !r.is_open).map((r) => ({ id: r.id, name: r.name, open_time: r.open_time, close_time: r.close_time })),
    location_source: locationSource
  };
}

// ───────────────────────── PHIÊN & KỶ NIỆM ─────────────────────────

/** Tạo mới hoặc cập nhật 1 phiên hỏi đáp.
 *  outcome: 'di_luon' (chọn quán từ gợi ý) | 'tu_tim' (Để bố tự tìm) | 'bo_do' (thoát giữa chừng) */
function saveSession_(s) {
  const data = Object.assign({}, s);
  ['answers', 'rejected'].forEach((k) => { if (data[k] && typeof data[k] !== 'string') data[k] = JSON.stringify(data[k]); });
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
  if (Array.isArray(meal.tastes)) meal.tastes = meal.tastes.join(', ');

  if (p.newRestaurant && p.newRestaurant.name) {
    const r = createRecord_('restaurants', p.newRestaurant);
    meal.restaurant_id = r.id;
    meal.restaurant_name = r.name;
    meal.is_new_place = true;
  }
  if (meal.restaurant_id && !meal.restaurant_name) {
    const r = readAll_('restaurants', true).filter((x) => x.id === meal.restaurant_id)[0];
    if (r) meal.restaurant_name = r.name;
  }
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
  meals.sort((a, b) => String(b.date + b.created_at).localeCompare(String(a.date + a.created_at)));
  return p.limit ? meals.slice(0, Number(p.limit)) : meals;
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
  const dishCount = {};
  inMonth.forEach((m) => {
    const key = m.dish_name || (dMap[m.dish_id] && dMap[m.dish_id].name);
    if (key) dishCount[key] = (dishCount[key] || 0) + 1;
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
    availableMonths: Object.keys(months).sort().reverse()
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
  });
  const blank = ss.getSheetByName('Sheet1') || ss.getSheetByName('Trang tính1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
}

/** Chạy 1 lần: tạo các sheet, tiêu đề cột, dữ liệu mẫu và mã truy cập. Chạy lại không làm mất dữ liệu. */
function setupSheets() {
  const ss = SpreadsheetApp.getActive();
  ensureSheets_();
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
  if (readAll_('config').length === 0) {
    const cfg = [
      ['app_name', 'Chìu ông hông bíc ăn gì', 'Tên app'],
      ['bot_name', 'Leeming', 'App tự xưng'],
      ['user_name', 'Cá', 'Cách app gọi người dùng'],
      ['home_lat', '', 'Vĩ độ nhà — dùng khi không lấy được vị trí điện thoại'],
      ['home_lng', '', 'Kinh độ nhà'],
      ['birthday_message', '', 'Lời chúc hiện ở màn hình chào'],
      ['photo_folder_id', '', 'Tự điền khi lưu ảnh đầu tiên']
    ];
    sheet_('config').getRange(2, 1, cfg.length, 3).setValues(cfg.map((r) => r.map((v) => (v === '' ? '' : "'" + v))));
  }

  if (readAll_('categories').length === 0) syncCategories_();

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
}
