/* =====================================================================
 *  Chìu ông hông bíc ăn gì — Frontend
 *  App tự xưng: Leeming · Người dùng: Cá (đọc từ sheet Config)
 *
 *  Logic gợi ý (chọn câu hỏi, chọn món, lọc quán đang mở…) KHÔNG viết
 *  lại ở đây: app tải backend/Code.gs và dùng chính các hàm của nó,
 *  nên server và điện thoại luôn gợi ý giống hệt nhau.
 * ===================================================================== */
(function () {
  'use strict';

  var CFG = window.APP_CONFIG || {};
  var DEMO = !CFG.API_URL;
  var WRITE_ACTIONS = { create: 1, update: 1, remove: 1, linkDishes: 1, saveSession: 1, saveMeal: 1 };
  var EXTRA_TASTES = ['Đậm đà', 'Thanh', 'Nhạt'];
  var SCORE_KEYS = ['quality', 'price_score', 'space', 'service'];
  var SCORE_LABELS = { quality: 'Chất lượng', price_score: 'Giá', space: 'Không gian', service: 'Phục vụ' };
  var DAY_CHIPS = [[1, 'T2'], [2, 'T3'], [3, 'T4'], [4, 'T5'], [5, 'T6'], [6, 'T7'], [0, 'CN']];

  var S = {
    data: null,
    token: null,
    route: 'home',
    param: null,
    home: { loaded: false, stats: null, last: null },
    ask: null,
    pick: null,
    memo: null,
    memories: null,
    book: { tab: 'shops', q: '', cat: 'Tất cả' },
    cats: { tab: 'restaurant', edit: null, busy: false, back: '#/settings' },
    stats: { month: null, data: null, loading: false },
    pos: null
  };

  // ───────────────────────── Tiện ích ─────────────────────────
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bộ nhớ đầy / chế độ riêng tư */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function user() { return (S.data && S.data.config && S.data.config.user_name) || 'Cá'; }
  function bot() { return (S.data && S.data.config && S.data.config.bot_name) || 'Leeming'; }
  function appName() { return (S.data && S.data.config && S.data.config.app_name) || 'Chìu ông hông bíc ăn gì'; }
  function today() { return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd'); }
  function nowIso() { return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', "yyyy-MM-dd'T'HH:mm:ssXXX"); }
  function dayNum(s) { var p = String(s).slice(0, 10).split('-').map(Number); return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 864e5); }
  var WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  function fmtDate(s) {
    if (!s) return '';
    var p = String(s).slice(0, 10).split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return WEEKDAYS[d.getUTCDay()] + ', ' + p[2] + '/' + p[1];
  }
  function relDays(s) {
    if (!s) return null;
    var n = dayNum(today()) - dayNum(s);
    if (n <= 0) return 'hôm nay';
    if (n === 1) return 'hôm qua';
    if (n < 14) return n + ' ngày trước';
    if (n < 60) return Math.round(n / 7) + ' tuần trước';
    return Math.round(n / 30) + ' tháng trước';
  }
  function fmtK(n) { n = Number(n); if (!n) return ''; return n >= 1000 ? Math.round(n / 1000) + 'k' : String(n); }
  function priceText(r) {
    if (r.dish_price) return fmtK(r.dish_price);
    if (r.price_min && r.price_max) return Math.round(r.price_min / 1000) + '–' + fmtK(r.price_max);
    return fmtK(r.price_min || r.price_max);
  }
  function kmText(km) {
    if (km == null) return '';
    return km < 1 ? 'Cách ' + Math.round(km * 1000) + ' m' : 'Cách ' + String(km).replace('.', ',') + ' km';
  }
  function photoSrc(m) {
    if (!m || !m.photo_url) return null;
    if (DEMO && m.photo_file_id) return GasDemo.photo(m.photo_file_id);
    return m.photo_url;
  }
  function attrLabel(key) {
    var a = (S.data.dishAttrs || []).filter(function (x) { return x.key === key; })[0];
    return a ? a.label : key;
  }
  function dishAttrsOn(d) {
    return (S.data.dishAttrs || []).filter(function (a) { return d[a.key] === true; }).map(function (a) { return a.label; });
  }
  function attrGroups() {
    return S.data.dishAttrGroups || [{ key: 'all', label: 'Đặc điểm', attrs: S.data.dishAttrs || [] }];
  }
  /** Chip vị cho kỷ niệm: các vị của món (lấy từ backend) + vài cảm nhận thêm. */
  function tasteChips() {
    var vi = attrGroups().filter(function (g) { return g.key === 'vi'; })[0];
    var base = vi ? vi.attrs.map(function (a) { return a.label; }) : ['Cay', 'Ngọt', 'Chua', 'Béo', 'Mặn'];
    return base.concat(EXTRA_TASTES.filter(function (t) { return base.indexOf(t) < 0; }));
  }
  function lower(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  /** Phân loại cố định của 1 loại ('restaurant' | 'dish'), theo sort_order. */
  function catList(type) {
    return (S.data.categories || []).filter(function (c) { return c.type === type; })
      .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
  }
  function catItems(type) { return type === 'restaurant' ? S.data.restaurants : S.data.dishes; }
  function catUsage(type) {
    var n = {};
    catItems(type).forEach(function (x) { if (x.category) n[lower(x.category)] = (n[lower(x.category)] || 0) + 1; });
    return n;
  }
  function typeWord(type) { return type === 'restaurant' ? 'quán' : 'món'; }
  /** Phân loại đang được dùng, xếp theo thứ tự trong danh sách cố định. */
  function categories(list, type) {
    var used = {};
    list.forEach(function (x) { if (x.category) used[x.category] = true; });
    var out = catList(type).map(function (c) { return c.name; }).filter(function (n) { return used[n]; });
    Object.keys(used).sort(function (a, b) { return a.localeCompare(b, 'vi'); }).forEach(function (n) { if (out.indexOf(n) < 0) out.push(n); });
    return out;
  }
  function categoryField(type, value, id) {
    var list = catList(type); var v = value || '';
    var known = list.some(function (c) { return c.name === v; });
    return '<div class="field"><div class="label-row"><label for="' + id + '">Phân loại</label>' +
      '<a class="small" href="#/cats/' + type + '">Sửa danh sách</a></div>' +
      '<select class="select" id="' + id + '" name="category"><option value="">— Chưa phân loại —</option>' +
      (v && !known ? '<option value="' + esc(v) + '" selected>' + esc(v) + ' (chưa có trong danh sách)</option>' : '') +
      list.map(function (c) { return '<option value="' + esc(c.name) + '"' + (c.name === v ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') +
      '</select>' + (list.length ? '' : '<span class="small muted">Chưa có danh sách phân loại ' + typeWord(type) + '.</span>') + '</div>';
  }

  // ── Điểm quán: 4 tiêu chí 0–5, điểm chung tính theo trọng số từ backend ──
  function scoreLabel(k) { return (S.data.ratingLabels && S.data.ratingLabels[k]) || SCORE_LABELS[k]; }
  function hasScore(v) { return v !== null && v !== undefined && v !== '' && !isNaN(Number(v)); }
  function fmtScore(n) { return String(Math.round(Number(n) * 100) / 100).replace('.', ','); }
  /** Cùng công thức với calcRating_ ở backend: Σ(w·x) / Σw trên các tiêu chí đang có. */
  function calcRating(r) {
    var w = S.data.ratingWeights || { quality: 0.5, service: 0.2, price_score: 0.2, space: 0.1 };
    var sum = 0; var tw = 0;
    Object.keys(w).forEach(function (k) { if (hasScore(r[k])) { sum += w[k] * Number(r[k]); tw += w[k]; } });
    return tw ? Math.round(sum / tw * 100) / 100 : null;
  }
  function subScores(r) {
    return SCORE_KEYS.filter(function (k) { return hasScore(r[k]); }).map(function (k) { return scoreLabel(k) + ' ' + fmtScore(r[k]); }).join(' · ');
  }
  function shopScore(r) { return r.rating != null ? r.rating : r.score; }
  function scoreFields(r) {
    var w = S.data.ratingWeights || {};
    var formula = Object.keys(w).sort(function (a, b) { return w[b] - w[a]; })
      .map(function (k) { return Math.round(w[k] * 100) + '% ' + scoreLabel(k); }).join(' + ');
    var overall = calcRating(r);
    return '<div class="field"><span class="label">Chấm điểm quán</span>' +
      '<span class="small muted">Kéo từ 0 đến 5, bước 0,5. Chưa biết thì để trống.</span><div class="scores">' +
      SCORE_KEYS.map(function (k) {
        var has = hasScore(r[k]);
        return '<div class="score-row"><label for="sc-' + k + '">' + esc(scoreLabel(k)) + '</label>' +
          '<input type="range" id="sc-' + k + '" name="' + k + '" min="0" max="5" step="0.5" value="' + (has ? Number(r[k]) : 0) + '" data-input="score"' + (has ? '' : ' data-empty="1"') + '>' +
          '<output for="sc-' + k + '">' + (has ? fmtScore(r[k]) : '–') + '</output>' +
          '<button type="button" class="clear" data-act="clearScore" data-k="' + k + '" aria-label="Bỏ điểm ' + esc(scoreLabel(k)) + '">' + I.close + '</button></div>';
      }).join('') + '</div>' +
      '<div class="overall"><span>Điểm chung</span><b data-overall>' + (overall == null ? '–' : fmtScore(overall)) + '</b></div>' +
      (formula ? '<span class="small muted">= ' + esc(formula) + '. Thiếu tiêu chí nào thì chia lại theo các tiêu chí còn lại.</span>' : '') + '</div>';
  }
  function readScores(form, into) {
    SCORE_KEYS.forEach(function (k) {
      var el = form.elements[k];
      if (el) into[k] = el.dataset.empty === '1' ? '' : Number(el.value);
    });
    return into;
  }
  function refreshOverall(form) {
    var b = form.querySelector('[data-overall]');
    if (!b) return;
    var r = calcRating(readScores(form, {}));
    b.textContent = r == null ? '–' : fmtScore(r);
  }
  function byName(a, b) { return String(a.name).localeCompare(String(b.name), 'vi'); }

  var toastTimer = null;
  function toast(msg, isErr) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (isErr ? ' err' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, isErr ? 4500 : 2600);
  }

  // ───────────────────────── Biểu tượng ─────────────────────────
  function svg(path, extra) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + path + '</svg>';
  }
  var I = {
    back: svg('<path d="M15 6l-6 6 6 6"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    heart: svg('<path d="M12 21s-7-4.4-9.3-9C1 8.6 3 5 6.5 5c2 0 3.6 1.2 5.5 3.3C13.9 6.2 15.5 5 17.5 5 21 5 23 8.6 21.3 12 19 16.6 12 21 12 21z"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    home: svg('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
    book: svg('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M9 7h6M9 11h6"/>'),
    camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    image: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>'),
    bowl: svg('<path d="M3 12h18a9 9 0 0 1-18 0zM7 8c0-2 2-2 2-4M12 8c0-2 2-2 2-4M17 8c0-2 2-2 2-4"/>', ' stroke-width="1.6"'),
    plus: svg('<path d="M12 5v14M5 12h14"/>', ' stroke-width="2.4"'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    up: svg('<path d="M6 15l6-6 6 6"/>'),
    down: svg('<path d="M6 9l6 6 6-6"/>'),
    edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    tag: svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>'),
    pin: svg('<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
    star: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="#E9A23B" stroke="#E9A23B" stroke-width="1.5" stroke-linejoin="round"><path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/></svg>',
    starInput: '<svg viewBox="0 0 24 24" aria-hidden="true" stroke-linejoin="round"><path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/></svg>'
  };

  // ───────────────────────── Gọi backend ─────────────────────────
  function api(action, payload) {
    payload = payload || {};
    if (DEMO) {
      return new Promise(function (resolve, reject) {
        var out = JSON.parse(doPost({ postData: { contents: JSON.stringify({ token: 'demo', action: action, payload: payload }) } }).text);
        if (WRITE_ACTIONS[action]) GasDemo.save();
        if (out.ok) resolve(out.data); else reject(new Error(out.error));
      });
    }
    return fetch(CFG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: S.token, action: action, payload: payload })
    }).then(function (res) {
      if (!res.ok) throw new Error('Lỗi mạng (' + res.status + ')');
      return res.json();
    }, function () {
      throw new Error('Không kết nối được tới máy chủ. Cá kiểm tra mạng nha.');
    }).then(function (out) {
      if (!out.ok) {
        if (/mã truy cập/i.test(out.error)) S.tokenBad = true;
        throw new Error(out.error);
      }
      return out.data;
    });
  }

  function refreshData() {
    return api('bootstrap').then(function (d) {
      S.data = d;
      if (!DEMO) LS.set('leeming_cache', d);
      return d;
    });
  }

  function loadBackend() {
    return fetch('backend/Code.gs', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('Không tải được backend/Code.gs (' + r.status + ')');
      return r.text();
    }).then(function (src) {
      (0, eval)(src); // khai báo các hàm của Code.gs vào phạm vi toàn cục
      if (typeof suggestDish_ !== 'function') throw new Error('backend/Code.gs không hợp lệ');
    });
  }

  function getPos(fresh) {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve(null);
      if (!fresh && S.pos && Date.now() - S.pos.t < 5 * 60 * 1000) return resolve(S.pos);
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, 9000);
      navigator.geolocation.getCurrentPosition(function (p) {
        if (done) return; done = true; clearTimeout(timer);
        S.pos = { lat: p.coords.latitude, lng: p.coords.longitude, t: Date.now() };
        resolve(S.pos);
      }, function () {
        if (done) return; done = true; clearTimeout(timer); resolve(null);
      }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 });
    });
  }

  function compressImage(file, maxSide) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.round(img.naturalWidth * s); var h = Math.round(img.naturalHeight * s);
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Không đọc được ảnh này')); };
      img.src = url;
    });
  }

  // ───────────────────────── Dữ liệu dùng thử ─────────────────────────
  function demoInit() {
    if (GasDemo.hasData()) {
      // Dữ liệu dùng thử tạo từ bản cũ: nâng cấp tại chỗ giống như chạy migrateSchemaV2() trên Sheet thật.
      if (!SpreadsheetApp.getActive().getSheetByName('Categories')) { migrateSchemaV2(); GasDemo.save(); }
      return;
    }
    setupSheets();
    setConfigValue_('home_lat', '21.0285');
    setConfigValue_('home_lng', '105.8542');
    setConfigValue_('birthday_message', '[Lời chúc của vợ sẽ hiện ở đây — sửa ô birthday_message trong sheet Config]');
    var d = bootstrap_();
    var R = function (part) { return d.restaurants.filter(function (r) { return r.name.indexOf(part) >= 0; })[0]; };
    var D = function (name) { return d.dishes.filter(function (x) { return x.name === name; })[0]; };
    var ago = function (n) { return Utilities.formatDate(new Date(Date.now() - n * 864e5), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd'); };
    [
      [1, 'bún chả', 'Bún chả', 5, ['Ngọt', 'Béo'], 'Chả nướng thơm, nước chấm vừa miệng', 2],
      [3, 'phở', 'Phở bò', 4, ['Đậm đà'], 'Nước dùng ngọt, quán hơi đông', 0],
      [5, 'đêm', 'Lẩu thái', 5, ['Cay', 'Chua'], 'Ăn xong toát mồ hôi luôn', 3],
      [8, 'bún chả', 'Bún chả', 4, ['Ngọt'], '', 1],
      [12, 'đêm', 'Ốc luộc', 4, ['Cay'], 'Ngồi vỉa hè gió mát', 0],
      [17, 'phở', 'Bánh cuốn', 3, ['Thanh'], 'Hơi nguội', 2],
      [21, 'bún chả', 'Cơm tấm', 4, ['Béo', 'Mặn'], '', 1]
    ].forEach(function (m) {
      var rej = d.dishes.slice(0, m[6]).map(function (x) { return x.id; });
      var s = saveSession_({ started_at: ago(m[0]) + 'T19:00:00+07:00', answers: [], rejected: rej });
      saveMeal_({ meal: { date: ago(m[0]), session_id: s.id, source: 'suggested', restaurant_id: R(m[1]).id, dish_id: D(m[2]).id, rating: m[3], tastes: m[4], feeling: m[5] } });
    });
    GasDemo.save();
  }

  // ───────────────────────── Điều hướng ─────────────────────────
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
  function route() {
    var h = location.hash.replace(/^#\/?/, '').split('/');
    var name = h[0] || 'home';
    var param = h[1] || null;
    if (!VIEWS[name]) name = 'home';
    if (name === 'ask' && !S.ask) name = 'home';
    if (name === 'places' && !S.pick) name = S.ask ? 'ask' : 'home';
    if (name === 'memo' && !S.memo) name = 'home';
    var changed = S.route !== name || S.param !== param;
    if (name === 'cats' && S.route !== 'cats') { S.cats.back = S.lastHash && !/^#\/?cats/.test(S.lastHash) ? S.lastHash : '#/settings'; S.cats.edit = null; }
    S.lastHash = location.hash || '#/home';
    closeModal();
    S.route = name; S.param = param;
    render();
    if (changed) window.scrollTo(0, 0);
  }
  function render() {
    if (S.route === 'token') { $('#app').innerHTML = vToken(); return; }
    if (!S.data) return;
    $('#app').innerHTML = VIEWS[S.route]();
    if (AFTER[S.route]) AFTER[S.route]();
  }

  function nav(active) {
    var items = [['home', 'Trang chủ', I.home], ['book', 'Sổ quán', I.book], ['memories', 'Kỷ niệm', I.camera], ['stats', 'Thống kê', I.chart]];
    return '<nav class="bottom-nav" aria-label="Điều hướng chính">' + items.map(function (it) {
      return '<a href="#/' + it[0] + '"' + (active === it[0] ? ' class="on" aria-current="page"' : '') + '>' + it[2] + it[1] + '</a>';
    }).join('') + '</nav>';
  }
  function topbar(backHash, eyebrow, title, right) {
    return '<div class="topbar">' +
      (backHash ? '<a class="icon-btn" href="' + backHash + '" aria-label="Quay lại">' + I.back + '</a>' : '') +
      '<div class="titles">' + (eyebrow ? '<span class="eyebrow">' + esc(eyebrow) + '</span>' : '') +
      '<h1 class="h1">' + esc(title) + '</h1></div>' + (right || '') + '</div>';
  }
  function starsInput(name, value) {
    var out = '<div class="stars" role="radiogroup" aria-label="Chấm điểm">';
    for (var n = 1; n <= 5; n++) {
      out += '<label class="' + (n <= (value || 0) ? 'on' : '') + '"><input type="radio" name="' + name + '" value="' + n + '"' +
        (n === value ? ' checked' : '') + ' aria-label="' + n + ' sao">' + I.starInput + '</label>';
    }
    return out + '</div>';
  }
  function starsText(n) {
    n = Number(n) || 0;
    var s = '';
    for (var i = 1; i <= 5; i++) s += i <= n ? '★' : '☆';
    return '<span aria-label="' + n + ' sao" style="color:#C98A1E;letter-spacing:2px">' + s + '</span>';
  }

  // ───────────────────────── Màn: nhập mã ─────────────────────────
  function vToken() {
    return '<section class="screen"><div class="ask-body">' +
      '<div class="stack center"><span class="h-xl">Chìu ông hông bíc ăn gì</span>' +
      '<span class="muted">Nhập mã bí mật để mở app nha.</span></div>' +
      '<form data-form="token" class="stack">' +
      '<label class="sr-only" for="tk">Mã truy cập</label>' +
      '<input class="input" id="tk" name="token" autocomplete="off" autocapitalize="off" placeholder="Mã truy cập" required>' +
      (S.tokenBad ? '<span class="small" style="color:#A3240B">Mã chưa đúng, Cá thử lại nha.</span>' : '') +
      '<button class="btn btn-primary btn-block" type="submit">Mở app</button></form></div></section>';
  }

  // ───────────────────────── Màn: trang chủ ─────────────────────────
  function vHome() {
    var d = S.data;
    var h = Number(Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'H'));
    var when = h < 10 ? 'Sáng nay' : h < 14 ? 'Trưa nay' : h < 18 ? 'Chiều nay' : 'Tối nay';
    var st = S.home.stats; var last = S.home.last;
    var lastHtml;
    if (last) {
      var src = photoSrc(last);
      lastHtml = '<div class="card row" style="padding:12px">' +
        '<div class="thumb">' + (src ? '<img src="' + esc(src) + '" alt="">' : I.image) + '</div>' +
        '<div class="stack grow" style="gap:4px"><strong>' + esc([last.dish_name, last.restaurant_name].filter(Boolean).join(' · ')) + '</strong>' +
        '<span class="small muted">' + esc(fmtDate(last.date)) + (last.rating ? ' · ' + last.rating + ' sao' : '') + '</span>' +
        (last.feeling ? '<span class="small" style="font-style:italic">“' + esc(last.feeling) + '”</span>' : '') + '</div></div>';
    } else {
      lastHtml = '<div class="card small muted">' + (S.home.loaded ? 'Chưa có bữa nào được ghi lại. Đi ăn thôi!' : 'Đang tải…') + '</div>';
    }
    return '<section class="screen with-nav">' + demoBar() +
      '<div class="row" style="justify-content:space-between"><div class="stack" style="gap:2px">' +
      '<span class="muted small">Chào ' + esc(user()) + ',</span>' +
      '<span class="h1">' + esc(appName()) + '</span></div>' +
      '<a class="icon-btn" href="#/settings" aria-label="Cài đặt">' + I.gear + '</a></div>' +
      '<div class="hero"><span class="kicker">' + when + ', ' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'HH:mm') + '</span>' +
      '<span class="h-xl">Hôm nay ăn gì đây ta?</span>' +
      '<p>' + esc(user()) + ' trả lời vài câu A hay B, ' + esc(bot()) + ' chọn món rồi tìm luôn quán còn mở gần nhà.</p>' +
      '<button class="btn btn-light" data-act="startAsk">Hỏi ' + esc(bot()) + ' đi ' + I.arrow + '</button></div>' +
      '<div class="tiles">' +
      '<a class="tile" href="#/book">' + I.book + '<strong>Sổ quán</strong><span>' + d.restaurants.length + ' quán · ' + d.dishes.length + ' món</span></a>' +
      '<a class="tile" href="#/stats">' + I.chart + '<strong>Thống kê</strong><span>' + (st ? 'Tháng này ' + st.totalMeals + ' bữa' : 'Xem khẩu vị') + '</span></a></div>' +
      '<div class="stack"><h2 class="h2">Bữa gần nhất</h2>' + lastHtml + '</div>' +
      '</section>' + nav('home');
  }
  function demoBar() {
    return DEMO ? '<div class="demo-bar"><span>Chế độ dùng thử · dữ liệu mẫu</span><a href="#/settings" style="color:inherit">Tìm hiểu</a></div>' : '';
  }

  // ───────────────────────── Màn: hỏi A/B ─────────────────────────
  function startAsk() {
    S.ask = { answers: [], rejected: [], phase: 'ask', q: null, dish: null, relaxed: [], startedAt: nowIso(), sessionPromise: null };
    S.pick = null;
    nextQ();
    go('#/ask');
  }
  function nextQ() {
    var a = S.ask;
    var r = nextQuestion_(S.data, { answers: a.answers, rejected: a.rejected });
    if (r.question) { a.phase = 'ask'; a.q = r.question; } else { a.phase = 'out'; }
  }
  function suggest() {
    var a = S.ask;
    var s = suggestDish_(S.data, { answers: a.answers, rejected: a.rejected });
    if (s.dish) { a.phase = 'suggest'; a.dish = s.dish; a.relaxed = s.relaxed; a.exhausted = false; }
    else { a.phase = 'out'; a.exhausted = true; }
  }
  function saveSessionBg(outcome) {
    var a = S.ask;
    if (!a || !a.answers.length) return;
    var body = { answers: a.answers, rejected: a.rejected, final_dish_id: a.dish ? a.dish.id : '', outcome: outcome };
    if (a.sessionPromise) {
      a.sessionPromise = a.sessionPromise.then(function (id) {
        if (!id) return null;
        body.id = id;
        return api('saveSession', { session: body }).then(function () { return id; }, function () { return id; });
      });
    } else {
      body.started_at = a.startedAt;
      a.sessionPromise = api('saveSession', { session: body }).then(function (r) { return r.id; }, function () { return null; });
    }
  }

  function vAsk() {
    var a = S.ask; var qs = S.data.questions;
    var qMap = {}; qs.forEach(function (q) { qMap[q.id] = q; });
    var total = qs.length;
    var label = a.phase === 'out' ? 'Hết câu hỏi' : 'Câu ' + Math.min(a.answers.length + (a.phase === 'ask' ? 1 : 0), total) + '/' + total;
    var bars = '';
    for (var i = 0; i < total; i++) bars += '<i class="' + (i < a.answers.length ? 'done' : '') + '"></i>';
    var chips = a.answers.map(function (x) {
      var q = qMap[x.question_id]; if (!q) return '';
      return '<span class="chip">' + esc(x.choice === 'A' ? q.option_a : q.option_b) + '</span>';
    }).join('');

    var body = '';
    if (a.phase === 'ask') {
      body = '<div class="ask-body pop"><h1 class="h-xl center">' + esc(a.q.text) + '</h1><div class="stack" style="gap:14px">' +
        '<button class="choice" data-act="choose" data-c="A"><span class="key">A</span><span class="label">' + esc(a.q.option_a) + '</span></button>' +
        '<button class="choice b" data-act="choose" data-c="B"><span class="key">B</span><span class="label">' + esc(a.q.option_b) + '</span></button>' +
        '</div></div>';
    } else if (a.phase === 'suggest') {
      var d = a.dish;
      var lastTxt = d.last_eaten ? 'Lần cuối ăn: ' + relDays(d.last_eaten) : 'Chưa ăn lần nào';
      body = '<div class="ask-body"><span class="muted center">Vậy thì ' + esc(bot()) + ' nghĩ ' + esc(user()) + ' nên ăn…</span>' +
        '<div class="dish-card pop"><div class="dish-art">' + (d.image_url ? '<img src="' + esc(d.image_url) + '" alt="">' : I.bowl) + '</div>' +
        '<span class="dish-name">' + esc(d.name) + '</span>' +
        '<span class="small muted">' + esc(lastTxt) + ' · ' + d.restaurant_count + ' quán có món này</span>' +
        (dishAttrsOn(d).length ? '<div class="chips" style="justify-content:center">' + dishAttrsOn(d).map(function (t) { return '<span class="chip chip-green">' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
        '</div>' +
        (a.relaxed && a.relaxed.length ? '<div class="note">Hông có món nào khớp hết, ' + esc(bot()) + ' đã bỏ bớt câu: ' + esc(a.relaxed.join(' · ')) + '</div>' : '') +
        '<div class="btn-row"><button class="btn btn-outline" data-act="reject">Hông chịu</button>' +
        '<button class="btn btn-primary" data-act="goEat">Đi luôn</button></div></div>';
    } else {
      body = '<div class="ask-body center pop" style="align-items:center">' +
        '<span class="h-xl" style="font-size:30px">' + (a.exhausted ? esc(user()) + ' chê hết món trong sổ rồi!' : 'Hết câu hỏi rồi mà ' + esc(user()) + ' vẫn hông chịu!') + '</span>' +
        '<span class="muted">Thôi được, hôm nay để ' + esc(user()) + ' tự quyết. Ăn xong nhớ kể ' + esc(bot()) + ' nghe nha.</span>' +
        '<button class="btn btn-primary" data-act="selfFind">Để bố tự tìm</button>' +
        (a.exhausted ? '' : '<button class="btn btn-outline" data-act="reroll">Cho món khác đi</button>') +
        '<button class="btn btn-ghost" data-act="startAsk">Hỏi lại từ đầu</button></div>';
    }
    return '<section class="screen">' +
      '<div class="row" style="justify-content:space-between"><a class="icon-btn" href="#/home" aria-label="Về trang chủ">' + I.back + '</a>' +
      '<span class="small muted" style="font-weight:600">' + label + '</span><span style="width:44px"></span></div>' +
      '<div class="progress" aria-hidden="true">' + bars + '</div>' +
      (chips ? '<div class="chips"><span class="small muted">Đã chọn:</span>' + chips + '</div>' : '') +
      body +
      (a.phase !== 'out' ? '<button class="link-quiet" data-act="selfFind">Để bố tự tìm</button>' : '') +
      '</section>';
  }

  // ───────────────────────── Màn: gợi ý quán ─────────────────────────
  function vPlaces() {
    var p = S.pick; var d = p.dish;
    var head = topbar('#/ask', 'Đi ăn ' + d.name + ' thôi',
      p.loading ? 'Đang tìm quán…' : (p.result.open.length ? p.result.open.length + ' quán đang mở' : 'Quán đóng hết rồi'));
    if (p.loading) {
      return '<section class="screen">' + head + '<div class="ask-body" style="align-items:center"><div class="spinner"></div>' +
        '<span class="muted">' + esc(bot()) + ' đang dò quán gần ' + esc(user()) + '…</span></div></section>';
    }
    var r = p.result;
    var list = r.open.slice();
    if (p.sort === 'near') list.sort(function (a, b) { return (a.distance_km == null ? 1e9 : a.distance_km) - (b.distance_km == null ? 1e9 : b.distance_km); });
    var locNote = r.location_source === 'home' ? 'Chưa lấy được vị trí điện thoại nên ' + bot() + ' tính khoảng cách từ nhà.'
      : r.location_source === 'none' ? 'Chưa bật vị trí nên chưa biết quán nào gần nhất.' : '';
    var cards = list.map(function (x) {
      var badges = (x.is_best ? '<span class="badge">Ngon nhất</span>' : '') + (x.is_nearest ? '<span class="badge badge-green">Gần nhất</span>' : '');
      var score = shopScore(x); var subs = subScores(x);
      return '<article class="card place">' + (badges ? '<div class="chips">' + badges + '</div>' : '') +
        '<div class="top"><div class="stack" style="gap:3px;min-width:0"><span class="name">' + esc(x.name) + '</span>' +
        (x.address ? '<span class="small muted">' + esc(x.address) + '</span>' : '') + '</div>' +
        (score != null ? '<span class="rating">' + I.star + Number(score).toFixed(1) + '</span>' : '') + '</div>' +
        (subs || x.dish_rating != null ? '<span class="small muted">' + esc([subs, x.dish_rating != null ? 'Món này ' + fmtScore(x.dish_rating) : ''].filter(Boolean).join(' · ')) + '</span>' : '') +
        '<div class="meta">' + [kmText(x.distance_km), x.close_time ? 'Mở đến ' + esc(x.close_time) : '', priceText(x)].filter(Boolean).map(function (t) { return '<span>' + t + '</span>'; }).join('') + '</div>' +
        '<div class="btn-row">' + (x.maps_link ? '<a class="btn btn-outline" href="' + esc(x.maps_link) + '" target="_blank" rel="noopener">Chỉ đường</a>' : '') +
        '<button class="btn btn-primary" data-act="pickPlace" data-id="' + esc(x.id) + '">Chọn quán này</button></div></article>';
    }).join('');
    var empty = '';
    if (!list.length) {
      empty = '<div class="card empty"><strong style="color:var(--ink)">Giờ này quán bán ' + esc(d.name) + ' đóng hết rồi</strong>' +
        (r.closed.length ? '<span class="small">' + r.closed.map(function (c) { return esc(c.name) + (c.open_time ? ' (mở ' + esc(c.open_time) + ')' : ''); }).join(' · ') + '</span>' : '<span class="small">Sổ chưa có quán nào bán món này.</span>') +
        '<div class="btn-row" style="width:100%"><button class="btn btn-outline" data-act="otherDish">Chọn món khác</button>' +
        '<button class="btn btn-primary" data-act="selfFind">Để bố tự tìm</button></div></div>';
    }
    return '<section class="screen">' + head +
      (list.length > 1 ? '<div class="segmented" role="tablist"><button role="tab" class="' + (p.sort === 'best' ? 'on' : '') + '" aria-selected="' + (p.sort === 'best') + '" data-act="sortPlaces" data-s="best">Ngon nhất</button>' +
        '<button role="tab" class="' + (p.sort === 'near' ? 'on' : '') + '" aria-selected="' + (p.sort === 'near') + '" data-act="sortPlaces" data-s="near">Gần nhất</button></div>' : '') +
      (locNote ? '<div class="note">' + esc(locNote) + '</div>' : '') +
      '<div class="list">' + cards + empty + '</div>' +
      (list.length ? '<button class="link-quiet" data-act="selfFind">Hông thích quán nào, để bố tự tìm</button>' : '') +
      '</section>';
  }
  function loadPlaces() {
    var p = S.pick;
    getPos().then(function (pos) {
      p.result = suggestRestaurants_(S.data, { dish_id: p.dish.id, lat: pos && pos.lat, lng: pos && pos.lng });
      p.loading = false;
      if (S.route === 'places' && S.pick === p) render();
    });
  }

  // ───────────────────────── Màn: lưu kỷ niệm ─────────────────────────
  function vMemo() {
    var m = S.memo; var self = m.mode === 'self';
    var head = self
      ? topbar(m.back || '#/home', 'Để bố tự tìm', 'Hôm nay ' + user() + ' ăn ở đâu thế?')
      : topbar('#/places', m.restaurant.name + ' · ' + fmtDate(today()), 'Bữa nay thấy sao ' + user() + '?');
    var placeFields = '';
    if (self) {
      var shops = S.data.restaurants.slice().sort(byName);
      var dishes = S.data.dishes.slice().sort(byName);
      placeFields =
        '<div class="field"><label for="m-place">Quán</label><select class="select" id="m-place" name="place" data-change="placeSel">' +
        '<option value="__new">＋ Quán mới, chưa có trong sổ</option>' +
        shops.map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>'; }).join('') + '</select></div>' +
        '<div class="stack" id="new-place">' +
        '<div class="field"><label for="m-name">Tên quán mới</label><input class="input" id="m-name" name="placeName" placeholder="Quán gì đó ngon ngon"></div>' +
        '<div class="field"><label for="m-addr">Địa chỉ</label><input class="input" id="m-addr" name="placeAddr" placeholder="Không bắt buộc"></div>' +
        categoryField('restaurant', '', 'm-cat') + scoreFields({}) +
        '<label class="row small" style="gap:8px"><input type="checkbox" name="useLoc" checked style="width:20px;height:20px;accent-color:var(--accent)"> Lưu vị trí hiện tại làm vị trí quán</label></div>' +
        '<div class="field"><label for="m-dish">Món</label><select class="select" id="m-dish" name="dish" data-change="dishSel">' +
        '<option value="">— Chọn món —</option>' +
        dishes.map(function (x) { return '<option value="' + esc(x.id) + '"' + (m.dish && m.dish.id === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') +
        '<option value="__other">Món khác…</option></select></div>' +
        '<div class="field" id="dish-other" hidden><label for="m-dname">Tên món</label><input class="input" id="m-dname" name="dishName"></div>';
    }
    return '<section class="screen">' + head +
      '<form data-form="memo" class="stack" style="gap:16px">' + placeFields +
      '<label class="photo-drop" id="photo-drop">' + (m.preview ? '<img src="' + m.preview + '" alt="Ảnh bữa ăn">' : I.camera + '<span>Chụp ảnh bữa ăn</span>') +
      '<input type="file" accept="image/*" name="photo" aria-label="Chụp hoặc chọn ảnh bữa ăn"></label>' +
      '<div class="field"><span class="label">Chấm điểm</span>' + starsInput('rating', 0) + '</div>' +
      '<div class="field"><span class="label">Hôm nay vị thế nào?</span><div class="chips">' +
      tasteChips().map(function (t) { return '<label class="toggle"><input type="checkbox" name="taste" value="' + esc(t) + '"><span>' + esc(t) + '</span></label>'; }).join('') + '</div></div>' +
      '<div class="field"><label for="m-feel">Cảm nhận</label><textarea class="textarea" id="m-feel" name="feeling" placeholder="Nước dùng ngọt, quán đông, lần sau đi sớm hơn…"></textarea></div>' +
      '<button class="btn btn-primary btn-block" type="submit">Lưu kỷ niệm</button></form></section>';
  }

  function saveMemo(form) {
    var m = S.memo; var fd = new FormData(form);
    var btn = form.querySelector('[type=submit]');
    var meal = { source: m.mode === 'self' ? 'self' : 'suggested', rating: Number(fd.get('rating')) || '', tastes: fd.getAll('taste'), feeling: String(fd.get('feeling') || '').trim() };
    var payload = { meal: meal };
    var prep = Promise.resolve();
    if (m.mode === 'suggested') {
      meal.restaurant_id = m.restaurant.id; meal.dish_id = m.dish.id;
    } else {
      var place = fd.get('place');
      if (place === '__new') {
        var name = String(fd.get('placeName') || '').trim();
        if (!name) { toast('Cá ghi tên quán giúp ' + bot() + ' nha', true); $('#m-name').focus(); return; }
        payload.newRestaurant = readScores(form, { name: name, address: String(fd.get('placeAddr') || '').trim(), category: String(fd.get('category') || '') });
        if (fd.get('useLoc')) prep = getPos(true).then(function (pos) { if (pos) { payload.newRestaurant.lat = pos.lat; payload.newRestaurant.lng = pos.lng; } });
      } else {
        meal.restaurant_id = place;
      }
      var dish = fd.get('dish');
      if (dish === '__other') meal.dish_name = String(fd.get('dishName') || '').trim();
      else if (dish) meal.dish_id = dish;
    }
    if (m.photo) payload.photo = m.photo;
    btn.disabled = true; btn.textContent = 'Đang lưu…';
    prep.then(function () {
      return S.ask && S.ask.sessionPromise ? S.ask.sessionPromise : null;
    }).then(function (sid) {
      if (sid) meal.session_id = sid;
      return api('saveMeal', payload);
    }).then(function () {
      S.ask = null; S.pick = null; S.memo = null; S.memories = null;
      S.home.loaded = false; S.stats.data = null;
      return refreshData();
    }).then(function () {
      toast(bot() + ' cất kỷ niệm này rồi nha');
      go('#/memories');
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = 'Lưu kỷ niệm';
      toast(e.message, true);
    });
  }

  // ───────────────────────── Màn: kỷ niệm ─────────────────────────
  function vMemories() {
    var body;
    if (!S.memories) body = '<div class="empty"><div class="spinner"></div></div>';
    else if (!S.memories.length) body = '<div class="card empty">Chưa có kỷ niệm nào. Lần tới đi ăn nhớ chụp ảnh nha!</div>';
    else {
      var groups = []; var cur = null;
      S.memories.forEach(function (m) {
        var key = String(m.date || '').slice(0, 7);
        if (!cur || cur.key !== key) { cur = { key: key, items: [] }; groups.push(cur); }
        cur.items.push(m);
      });
      body = groups.map(function (g) {
        var p = g.key.split('-');
        return '<h2 class="month-label">Tháng ' + Number(p[1]) + '/' + p[0] + '</h2>' + g.items.map(function (m) {
          var src = photoSrc(m);
          var tastes = String(m.tastes || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
          return '<article class="card memory">' + (src ? '<img src="' + esc(src) + '" alt="Ảnh ' + esc(m.dish_name || 'bữa ăn') + '" loading="lazy">' : '') +
            '<div class="body"><strong>' + esc([m.dish_name, m.restaurant_name].filter(Boolean).join(' · ') || 'Bữa ăn') + '</strong>' +
            '<span class="small muted">' + esc(fmtDate(m.date)) + (m.source === 'self' ? ' · tự tìm' : '') + (m.is_new_place ? ' · quán mới' : '') + '</span>' +
            (m.rating ? starsText(m.rating) : '') +
            (tastes.length ? '<div class="chips">' + tastes.map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
            (m.feeling ? '<span class="feel">“' + esc(m.feeling) + '”</span>' : '') + '</div></article>';
        }).join('');
      }).join('');
    }
    return '<section class="screen with-nav">' + topbar(null, 'Những bữa ăn của hai đứa', 'Kỷ niệm') +
      '<div class="list">' + body + '</div></section>' +
      '<button class="fab" data-act="newMemory">' + I.plus + 'Ghi bữa ăn</button>' + nav('memories');
  }

  // ───────────────────────── Màn: sổ quán & món ─────────────────────────
  function vBook() {
    var b = S.book; var shops = b.tab === 'shops';
    var cats = ['Tất cả'].concat(categories(shops ? S.data.restaurants : S.data.dishes, shops ? 'restaurant' : 'dish'));
    if (cats.indexOf(b.cat) < 0) b.cat = 'Tất cả';
    return '<section class="screen with-nav">' + topbar(null, null, 'Sổ ăn uống') +
      '<div class="segmented" role="tablist">' +
      '<button role="tab" aria-selected="' + shops + '" class="' + (shops ? 'on' : '') + '" data-act="bookTab" data-t="shops">Quán (' + S.data.restaurants.length + ')</button>' +
      '<button role="tab" aria-selected="' + !shops + '" class="' + (!shops ? 'on' : '') + '" data-act="bookTab" data-t="dishes">Món (' + S.data.dishes.length + ')</button></div>' +
      '<div class="search">' + I.search + '<label class="sr-only" for="bq">Tìm kiếm</label>' +
      '<input id="bq" type="search" data-input="bookq" value="' + esc(b.q) + '" placeholder="' + (shops ? 'Tìm quán theo tên, địa chỉ…' : 'Tìm món…') + '"></div>' +
      '<div class="chips">' + cats.map(function (c) {
        return '<button class="filter' + (c === b.cat ? ' on' : '') + '" data-act="bookCat" data-c="' + esc(c) + '">' + esc(c) + '</button>';
      }).join('') + '<a class="filter filter-link" href="#/cats/' + (shops ? 'restaurant' : 'dish') + '">' + I.tag + 'Sửa phân loại</a></div>' +
      '<div class="list" id="book-list">' + bookList() + '</div></section>' +
      '<button class="fab" data-act="' + (shops ? 'newShop' : 'newDish') + '">' + I.plus + (shops ? 'Thêm quán' : 'Thêm món') + '</button>' + nav('book');
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd'); }
  function bookList() {
    var b = S.book; var q = norm(b.q);
    var match = function (x, fields) { return (b.cat === 'Tất cả' || x.category === b.cat) && (!q || fields.some(function (f) { return norm(x[f]).indexOf(q) >= 0; })); };
    if (b.tab === 'shops') {
      var list = S.data.restaurants.filter(function (r) { return match(r, ['name', 'address', 'category']); })
        .sort(function (a, c) { return (shopScore(c) || 0) - (shopScore(a) || 0); });
      if (!list.length) return '<div class="card empty">Không thấy quán nào.</div>';
      return list.map(function (r) {
        var meta = [r.category, priceText(r), r.visit_count ? 'đã ăn ' + r.visit_count + ' lần' : 'chưa ăn lần nào'].filter(Boolean).join(' · ');
        return '<button class="card list-item" data-act="openShop" data-id="' + esc(r.id) + '" style="padding:14px">' +
          '<span class="avatar">' + esc(String(r.name).replace(/^\[.*?\]\s*/, '').charAt(0).toUpperCase()) + '</span>' +
          '<span class="stack grow" style="gap:2px"><strong>' + esc(r.name) + '</strong><span class="small muted">' + esc(meta) + '</span></span>' +
          (shopScore(r) != null ? '<span class="rating" style="font-size:14px">' + I.star + Number(shopScore(r)).toFixed(1) + '</span>' : '') + '</button>';
      }).join('');
    }
    var dl = S.data.dishes.filter(function (d) { return match(d, ['name', 'category']); })
      .sort(function (a, c) { return (c.times_eaten || 0) - (a.times_eaten || 0) || byName(a, c); });
    if (!dl.length) return '<div class="card empty">Không thấy món nào.</div>';
    return dl.map(function (d) {
      var tags = dishAttrsOn(d);
      return '<button class="card list-item" data-act="openDish" data-id="' + esc(d.id) + '" style="flex-direction:column;align-items:stretch;gap:8px;padding:14px">' +
        '<span class="row" style="justify-content:space-between"><strong>' + esc(d.name) + '</strong><span class="small muted">' +
        (d.times_eaten ? 'Ăn ' + d.times_eaten + ' lần' : 'Chưa ăn') + ' · ' + d.restaurant_count + ' quán</span></span>' +
        (tags.length ? '<span class="chips">' + tags.map(function (t) { return '<span class="chip chip-green">' + esc(t) + '</span>'; }).join('') + '</span>' : '') + '</button>';
    }).join('');
  }

  // ── Form quán ──
  function vShop() {
    var isNew = S.param === 'new' || !S.param;
    var r = isNew ? {} : S.data.restaurants.filter(function (x) { return x.id === S.param; })[0];
    if (!r) return vMissing();
    var days = isNew ? [0, 1, 2, 3, 4, 5, 6] : openDays_(r.open_days);
    var linked = {};
    if (!isNew) S.data.restaurantDishes.forEach(function (l) { if (l.restaurant_id === r.id) linked[l.dish_id] = l; });
    var dishes = S.data.dishes.slice().sort(byName);
    var v = function (k) { return r[k] == null ? '' : esc(r[k]); };
    return '<section class="screen">' + topbar('#/book', isNew ? 'Thêm vào sổ' : 'Sửa thông tin', isNew ? 'Quán mới' : r.name) +
      '<form data-form="shop" class="stack" style="gap:16px">' +
      '<div class="field"><label for="s-name">Tên quán *</label><input class="input" id="s-name" name="name" required value="' + v('name') + '"></div>' +
      categoryField('restaurant', r.category, 's-cat') +
      '<div class="field"><label for="s-addr">Địa chỉ</label><input class="input" id="s-addr" name="address" value="' + v('address') + '"></div>' +
      '<div class="field"><label for="s-map">Link Google Maps hoặc tọa độ</label><input class="input" id="s-map" name="maps_url" data-change="mapLink" value="' + v('maps_url') + '" placeholder="Dán link, hoặc 21.0285, 105.8542">' +
      '<div class="grid-2"><input class="input" name="lat" inputmode="decimal" aria-label="Vĩ độ" placeholder="Vĩ độ" value="' + v('lat') + '">' +
      '<input class="input" name="lng" inputmode="decimal" aria-label="Kinh độ" placeholder="Kinh độ" value="' + v('lng') + '"></div>' +
      '<button type="button" class="btn btn-outline" data-act="useHere">' + I.pin + 'Lấy vị trí hiện tại</button></div>' +
      '<div class="field"><span class="label">Giờ mở cửa</span><div class="grid-2">' +
      '<input class="input" type="time" name="open_time" aria-label="Giờ mở" value="' + v('open_time') + '">' +
      '<input class="input" type="time" name="close_time" aria-label="Giờ đóng" value="' + v('close_time') + '"></div>' +
      '<span class="small muted">Quán mở qua đêm thì giờ đóng nhỏ hơn giờ mở, ví dụ 18:00 → 02:00.</span>' +
      '<div class="chips">' + DAY_CHIPS.map(function (dc) {
        return '<label class="toggle sm"><input type="checkbox" name="day" value="' + dc[0] + '"' + (days.indexOf(dc[0]) >= 0 ? ' checked' : '') + '><span>' + dc[1] + '</span></label>';
      }).join('') + '</div></div>' +
      '<div class="field"><span class="label">Giá (đồng)</span><div class="grid-2">' +
      '<input class="input" type="number" inputmode="numeric" step="1000" min="0" name="price_min" aria-label="Giá thấp nhất" placeholder="Từ, vd 40000" value="' + v('price_min') + '">' +
      '<input class="input" type="number" inputmode="numeric" step="1000" min="0" name="price_max" aria-label="Giá cao nhất" placeholder="Đến, vd 70000" value="' + v('price_max') + '"></div></div>' +
      scoreFields(r) +
      '<div class="field"><label for="s-cmt">Nhận xét</label><textarea class="textarea" id="s-cmt" name="comment">' + v('comment') + '</textarea></div>' +
      '<div class="field"><span class="label">Quán có bán món</span>' +
      (dishes.length ? '<div class="dish-pick">' + dishes.map(function (d) {
        var l = linked[d.id];
        return '<div class="r"><input type="checkbox" id="dp-' + esc(d.id) + '" name="dish" value="' + esc(d.id) + '"' + (l ? ' checked' : '') + '>' +
          '<label for="dp-' + esc(d.id) + '">' + esc(d.name) + '</label>' +
          '<input class="input" type="number" inputmode="numeric" step="1000" min="0" name="price_' + esc(d.id) + '" aria-label="Giá ' + esc(d.name) + '" placeholder="Giá" value="' + (l && l.price ? esc(l.price) : '') + '"></div>';
      }).join('') + '</div>' : '<span class="small muted">Chưa có món nào trong sổ, thêm món ở tab Món trước nha.</span>') + '</div>' +
      '<button class="btn btn-primary btn-block" type="submit">' + (isNew ? 'Thêm quán' : 'Lưu thay đổi') + '</button>' +
      (isNew ? '' : '<button type="button" class="btn btn-danger btn-block" data-act="delShop">Xóa quán khỏi sổ</button>') +
      '</form></section>';
  }
  function parseCoords(s) {
    s = String(s || '');
    var pats = [/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /[?&](?:q|query|destination|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/];
    for (var i = 0; i < pats.length; i++) { var m = s.match(pats[i]); if (m) return { lat: Number(m[1]), lng: Number(m[2]) }; }
    return null;
  }
  function saveShop(form) {
    var fd = new FormData(form);
    var isNew = S.param === 'new' || !S.param;
    var days = fd.getAll('day').map(Number);
    var openDays = days.length === 7 ? '' : DAY_CHIPS.filter(function (dc) { return days.indexOf(dc[0]) >= 0; }).map(function (dc) { return dc[1]; }).join(',');
    var data = {
      name: String(fd.get('name') || '').trim(), category: String(fd.get('category') || '').trim(), address: String(fd.get('address') || '').trim(),
      maps_url: String(fd.get('maps_url') || '').trim(), lat: fd.get('lat'), lng: fd.get('lng'),
      open_time: fd.get('open_time'), close_time: fd.get('close_time'), open_days: openDays,
      price_min: fd.get('price_min'), price_max: fd.get('price_max'),
      comment: String(fd.get('comment') || '').trim()
    };
    readScores(form, data);
    if (!data.name) { toast('Quán phải có tên nha', true); return; }
    if (/^-?\d/.test(data.maps_url) && parseCoords(data.maps_url)) data.maps_url = '';
    var dishes = fd.getAll('dish').map(function (id) { return { dish_id: id, price: fd.get('price_' + id) || '' }; });
    var btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Đang lưu…';
    var p = isNew ? api('create', { table: 'restaurants', data: data }) : api('update', { table: 'restaurants', id: S.param, data: data });
    p.then(function (r) {
      return api('linkDishes', { restaurant_id: r.id, dishes: dishes });
    }).then(refreshData).then(function () {
      toast(isNew ? 'Đã thêm ' + data.name + ' vào sổ' : 'Đã lưu');
      go('#/book');
    }).catch(function (e) { btn.disabled = false; btn.textContent = 'Thử lại'; toast(e.message, true); });
  }

  // ── Form món ──
  function vDish() {
    var isNew = S.param === 'new' || !S.param;
    var d = isNew ? {} : S.data.dishes.filter(function (x) { return x.id === S.param; })[0];
    if (!d) return vMissing();
    var shops = isNew ? [] : S.data.restaurantDishes.filter(function (l) { return l.dish_id === d.id; }).map(function (l) {
      var r = S.data.restaurants.filter(function (x) { return x.id === l.restaurant_id; })[0];
      return r ? r.name + (l.price ? ' · ' + fmtK(l.price) : '') : null;
    }).filter(Boolean);
    var v = function (k) { return d[k] == null ? '' : esc(d[k]); };
    return '<section class="screen">' + topbar('#/book', isNew ? 'Thêm vào sổ' : 'Sửa món', isNew ? 'Món mới' : d.name) +
      '<form data-form="dish" class="stack" style="gap:16px">' +
      '<div class="field"><label for="d-name">Tên món *</label><input class="input" id="d-name" name="name" required value="' + v('name') + '"></div>' +
      categoryField('dish', d.category, 'd-cat') +
      '<div class="field"><span class="label">Đặc điểm</span><span class="small muted">Chọn hết những gì đúng với món này — ' + esc(bot()) + ' dựa vào đây để hỏi A/B.</span>' +
      attrGroups().map(function (g) {
        return '<div class="attr-group"><span class="group-label">' + esc(g.label) + '</span><div class="chips">' + g.attrs.map(function (a) {
          return '<label class="toggle sm"><input type="checkbox" name="attr" value="' + esc(a.key) + '"' + (d[a.key] === true ? ' checked' : '') + '><span>' + esc(a.label) + '</span></label>';
        }).join('') + '</div></div>';
      }).join('') + '</div>' +
      '<div class="field"><label for="d-img">Link ảnh món</label><input class="input" id="d-img" name="image_url" type="url" value="' + v('image_url') + '" placeholder="Không bắt buộc"></div>' +
      '<div class="field"><label for="d-note">Ghi chú</label><textarea class="textarea" id="d-note" name="note">' + v('note') + '</textarea></div>' +
      (isNew ? '' : '<div class="field"><span class="label">Có ở quán</span>' + (shops.length ? '<div class="chips">' + shops.map(function (s) { return '<span class="chip">' + esc(s) + '</span>'; }).join('') + '</div>' : '<span class="small muted">Chưa gán quán nào. Mở quán trong sổ để gán món.</span>') + '</div>') +
      '<button class="btn btn-primary btn-block" type="submit">' + (isNew ? 'Thêm món' : 'Lưu thay đổi') + '</button>' +
      (isNew ? '' : '<button type="button" class="btn btn-danger btn-block" data-act="delDish">Xóa món khỏi sổ</button>') +
      '</form></section>';
  }
  function saveDish(form) {
    var fd = new FormData(form);
    var isNew = S.param === 'new' || !S.param;
    var on = fd.getAll('attr');
    var data = { name: String(fd.get('name') || '').trim(), category: String(fd.get('category') || '').trim(), image_url: String(fd.get('image_url') || '').trim(), note: String(fd.get('note') || '').trim() };
    (S.data.dishAttrs || []).forEach(function (a) { data[a.key] = on.indexOf(a.key) >= 0; });
    if (!data.name) { toast('Món phải có tên nha', true); return; }
    var btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Đang lưu…';
    (isNew ? api('create', { table: 'dishes', data: data }) : api('update', { table: 'dishes', id: S.param, data: data }))
      .then(refreshData).then(function () { toast(isNew ? 'Đã thêm ' + data.name : 'Đã lưu'); go('#/book'); })
      .catch(function (e) { btn.disabled = false; btn.textContent = 'Thử lại'; toast(e.message, true); });
  }
  function vMissing() {
    return '<section class="screen">' + topbar('#/book', null, 'Không tìm thấy') + '<div class="card empty">Mục này không còn trong sổ.</div></section>';
  }

  // ───────────────────────── Màn: quản lý phân loại ─────────────────────────
  function vCats() {
    var c = S.cats;
    if (S.param === 'restaurant' || S.param === 'dish') c.tab = S.param;
    var type = c.tab; var list = catList(type); var used = catUsage(type);
    var tab = function (t, label) {
      return '<button role="tab" aria-selected="' + (type === t) + '" class="' + (type === t ? 'on' : '') + '" data-act="catTab" data-t="' + t + '">' + label + ' (' + catList(t).length + ')</button>';
    };
    var rows = list.map(function (x, i) {
      var n = used[lower(x.name)] || 0;
      if (c.edit === x.id) {
        return '<form class="card cat-row" data-form="catRename" data-id="' + esc(x.id) + '">' +
          '<label class="sr-only" for="cat-edit">Tên mới</label><input class="input grow" id="cat-edit" name="name" value="' + esc(x.name) + '" required>' +
          '<button class="btn btn-primary btn-sm" type="submit"' + (c.busy ? ' disabled' : '') + '>Lưu</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-act="catEditCancel">Hủy</button></form>';
      }
      var dis = c.busy ? ' disabled' : '';
      return '<div class="card cat-row"><span class="stack grow" style="gap:2px"><strong>' + esc(x.name) + '</strong>' +
        '<span class="small muted">' + (n ? n + ' ' + typeWord(type) + ' đang dùng' : 'Chưa dùng') + '</span></span>' +
        '<button class="icon-btn sm" data-act="catMove" data-id="' + esc(x.id) + '" data-d="-1" aria-label="Đưa “' + esc(x.name) + '” lên"' + (i === 0 ? ' disabled' : dis) + '>' + I.up + '</button>' +
        '<button class="icon-btn sm" data-act="catMove" data-id="' + esc(x.id) + '" data-d="1" aria-label="Đưa “' + esc(x.name) + '” xuống"' + (i === list.length - 1 ? ' disabled' : dis) + '>' + I.down + '</button>' +
        '<button class="icon-btn sm" data-act="catEdit" data-id="' + esc(x.id) + '" aria-label="Đổi tên “' + esc(x.name) + '”"' + dis + '>' + I.edit + '</button>' +
        '<button class="icon-btn sm danger" data-act="catDel" data-id="' + esc(x.id) + '" aria-label="Xóa “' + esc(x.name) + '”"' + dis + '>' + I.trash + '</button></div>';
    }).join('');
    return '<section class="screen">' + topbar(c.back || '#/settings', 'Quản lý dữ liệu', 'Phân loại') +
      '<div class="segmented" role="tablist">' + tab('restaurant', 'Quán') + tab('dish', 'Món') + '</div>' +
      '<form data-form="catAdd" class="row"><label class="sr-only" for="cat-new">Tên phân loại mới</label>' +
      '<input class="input grow" id="cat-new" name="name" placeholder="Thêm phân loại ' + typeWord(type) + '…" required>' +
      '<button class="btn btn-primary" type="submit"' + (c.busy ? ' disabled' : '') + '>' + I.plus + 'Thêm</button></form>' +
      '<span class="small muted">Thứ tự ở đây là thứ tự hiện trong ô chọn phân loại và bộ lọc Sổ quán.</span>' +
      '<div class="list">' + (rows || '<div class="card empty">Chưa có phân loại nào. Khi danh sách trống, ' + typeWord(type) + ' nhập phân loại gì cũng được.</div>') + '</div>' +
      '</section>';
  }
  function catById(id) { return (S.data.categories || []).filter(function (x) { return x.id === id; })[0]; }
  /** Chạy 1 thao tác phân loại: khóa nút, gọi API, tải lại bootstrap, báo kết quả. */
  function catOp(run, done) {
    var c = S.cats;
    if (c.busy) return;
    c.busy = true; render();
    Promise.resolve().then(run).then(function (res) {
      return refreshData().then(function () { return res; });
    }).then(function (res) {
      c.busy = false; c.edit = null;
      if (S.route === 'cats') render();
      if (done) toast(done(res));
    }).catch(function (e) {
      c.busy = false;
      if (S.route === 'cats') render();
      toast(e.message, true);
    });
  }
  function closeModal() { var m = $('.modal'); if (m) m.remove(); }
  function openReassign(x, n) {
    closeModal();
    var others = catList(x.type).filter(function (o) { return o.id !== x.id; });
    var el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = '<div class="sheet card stack" role="dialog" aria-modal="true" aria-labelledby="mdl-t">' +
      '<h2 class="h2" id="mdl-t">Xóa “' + esc(x.name) + '”</h2>' +
      '<span class="small">Đang có ' + n + ' ' + typeWord(x.type) + ' dùng phân loại này. Chọn phân loại để chuyển chúng sang trước khi xóa.</span>' +
      (others.length
        ? '<label class="sr-only" for="mdl-to">Chuyển sang</label><select class="select" id="mdl-to">' +
          others.map(function (o) { return '<option value="' + esc(o.name) + '">' + esc(o.name) + '</option>'; }).join('') + '</select>' +
          '<div class="btn-row"><button class="btn btn-outline" data-act="modalClose">Hủy</button>' +
          '<button class="btn btn-primary" data-act="catDelConfirm" data-id="' + esc(x.id) + '">Chuyển &amp; xóa</button></div>'
        : '<span class="small muted">Chưa có phân loại nào khác để chuyển sang. Thêm một phân loại mới trước nha.</span>' +
          '<button class="btn btn-outline" data-act="modalClose">Đóng</button>') + '</div>';
    document.body.appendChild(el);
    var f = el.querySelector('select, button'); if (f) f.focus();
  }

  // ───────────────────────── Màn: thống kê ─────────────────────────
  function vStats() {
    var st = S.stats; var d = st.data;
    var months = (d && d.availableMonths ? d.availableMonths.slice() : []);
    var curMonth = st.month || today().slice(0, 7);
    if (months.indexOf(today().slice(0, 7)) < 0) months.unshift(today().slice(0, 7));
    if (months.indexOf(curMonth) < 0) months.push(curMonth);
    months.sort().reverse();
    var picker = '<label class="sr-only" for="st-month">Chọn tháng</label><select id="st-month" class="select" style="width:auto;padding:10px 12px" data-change="statMonth">' +
      months.map(function (m) { var p = m.split('-'); return '<option value="' + m + '"' + (m === curMonth ? ' selected' : '') + '>Tháng ' + Number(p[1]) + '/' + p[0] + '</option>'; }).join('') + '</select>';
    var head = topbar(null, 'Nhà mình đã ăn gì', 'Thống kê', picker);
    if (!d || st.loading) return '<section class="screen with-nav">' + head + '<div class="empty"><div class="spinner"></div></div></section>' + nav('stats');

    var tastes = d.tasteProfile.filter(function (t) { return t.percent > 0; }).slice(0, 6);
    var maxW = Math.max.apply(null, d.byWeekday.map(function (x) { return x.meals; }).concat([1]));
    var week = d.byWeekday.slice(1).concat(d.byWeekday.slice(0, 1));
    var p = d.month.split('-');
    return '<section class="screen with-nav">' + head + demoBar() +
      '<div class="stat-tiles">' +
      '<div class="stat red"><b>' + d.totalMeals + '</b><span>bữa đi ăn</span></div>' +
      '<div class="stat green"><b>' + d.newPlaces + '</b><span>quán mới</span></div>' +
      '<div class="stat"><b>' + (d.avgRejects == null ? '–' : String(d.avgRejects).replace('.', ',')) + '</b><span>lần “Hông chịu” mỗi lần hỏi</span></div></div>' +
      '<div class="card stack"><div class="row" style="justify-content:space-between;align-items:baseline"><h2 class="h2">Khẩu vị ' + d.tasteWindow.days + ' ngày gần đây</h2><span class="small muted">% số bữa</span></div>' +
      (tastes.length ? tastes.map(function (t) {
        return '<div class="bar-row"><span class="k">' + esc(t.label) + '</span><span class="track"><span class="fill" style="display:block;width:' + t.percent + '%"></span></span><span class="v">' + t.percent + '%</span></div>';
      }).join('') + '<span class="small muted">Tính từ ' + d.tasteWindow.meals + ' bữa, đến ngày ' + esc(fmtDate(d.tasteWindow.until)) + '</span>'
        : '<span class="small muted">Chưa có bữa nào trong khoảng này.</span>') + '</div>' +
      '<div class="card stack"><h2 class="h2">Ăn lại nhiều nhất tháng ' + Number(p[1]) + '</h2>' +
      (d.topDishes.length ? d.topDishes.map(function (x, i) {
        return '<div class="row"><span class="rank">' + (i + 1) + '</span><span class="grow" style="font-weight:600">' + esc(x.name) + '</span><span class="small muted">' + x.times + ' lần</span></div>';
      }).join('') : '<span class="small muted">Tháng này chưa ăn gì cả.</span>') + '</div>' +
      '<div class="card stack"><h2 class="h2">Hay đi ăn ngày nào</h2><div class="week">' + week.map(function (w) {
        return '<div><span>' + (w.meals || '') + '</span><i style="height:' + Math.round(80 * w.meals / maxW) + '%"></i><span>' + w.day + '</span></div>';
      }).join('') + '</div></div>' +
      '<div class="stack"><h2 class="h2">Album tháng này</h2>' +
      (d.photos.length ? '<div class="album">' + d.photos.slice(0, 12).map(function (ph) {
        var src = DEMO ? GasDemo.photo(String(ph.url).split('id=')[1].split('&')[0]) : ph.url;
        return src ? '<img src="' + esc(src) + '" alt="' + esc(ph.dish_name || 'Bữa ăn') + '" loading="lazy">' : '<div></div>';
      }).join('') + '</div>' : '<div class="card small muted">Chưa có ảnh nào. Lần tới nhớ chụp nha!</div>') + '</div>' +
      '</section>' + nav('stats');
  }
  function loadStats() {
    var st = S.stats; var month = st.month || today().slice(0, 7);
    st.loading = true;
    api('getStats', { month: month }).then(function (d) {
      st.data = d; st.month = month; st.loading = false;
      if (S.route === 'stats') render();
    }).catch(function (e) { st.loading = false; toast(e.message, true); });
  }

  // ───────────────────────── Màn: cài đặt ─────────────────────────
  function vSettings() {
    var c = S.data.config || {};
    return '<section class="screen">' + topbar('#/home', null, 'Cài đặt') +
      '<div class="card stack"><h2 class="h2">' + (DEMO ? 'Đang ở chế độ dùng thử' : 'Đã kết nối Google Sheet') + '</h2>' +
      (DEMO ? '<span class="small muted">Dữ liệu mẫu chỉ lưu trên trình duyệt này. Dán Web app URL vào file js/config.js để dùng dữ liệu thật.</span>' +
        '<button class="btn btn-outline" data-act="resetDemo">Đặt lại dữ liệu mẫu</button>'
        : '<span class="small muted">Dữ liệu lưu trong Google Sheet. Sửa tên gọi, vị trí nhà, lời chúc ở sheet Config.</span>' +
        '<form data-form="token" class="stack"><label class="small" for="tk2" style="font-weight:600">Đổi mã truy cập</label>' +
        '<input class="input" id="tk2" name="token" autocomplete="off" autocapitalize="off" placeholder="Mã mới"><button class="btn btn-outline" type="submit">Lưu mã</button></form>') +
      '<button class="btn btn-outline" data-act="reload">Tải lại dữ liệu</button></div>' +
      '<div class="card stack"><h2 class="h2">Quản lý dữ liệu</h2>' +
      '<span class="small muted">Danh sách phân loại cố định cho quán và món: thêm, đổi tên, sắp xếp, xóa.</span>' +
      '<a class="btn btn-outline" href="#/cats">' + I.tag + 'Phân loại quán &amp; món</a></div>' +
      (c.birthday_message ? '<div class="card stack"><h2 class="h2">Lời chúc</h2><button class="btn btn-outline" data-act="showSplash">Xem lại lời chúc</button></div>' : '') +
      '<div class="card stack"><h2 class="h2">Cài app lên màn hình chính</h2>' +
      '<span class="small"><b>iPhone:</b> mở bằng Safari → nút Chia sẻ → “Thêm vào MH chính”.</span>' +
      '<span class="small"><b>Android:</b> mở bằng Chrome → menu ⋮ → “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính”.</span></div>' +
      '<span class="small muted center">' + esc(appName()) + ' · ' + esc(bot()) + ' làm cho ' + esc(user()) + '</span>' +
      '</section>';
  }

  // ───────────────────────── Lời chúc sinh nhật ─────────────────────────
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
  function showSplash(force) {
    var msg = S.data && S.data.config && S.data.config.birthday_message;
    if (!msg) return;
    var key = 'leeming_seen_' + hash(String(msg));
    if (!force && LS.get(key, false)) return;
    var el = document.createElement('div');
    el.className = 'overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Lời chúc sinh nhật');
    el.innerHTML = I.heart + '<div class="big">Chúc mừng sinh nhật ' + esc(user()) + '!</div><p>' + esc(msg) + '</p>' +
      '<button class="btn btn-light" data-act="closeSplash">Mở quà thôi</button>';
    document.body.appendChild(el);
    LS.set(key, true);
    var b = el.querySelector('button'); if (b) b.focus();
  }

  // ───────────────────────── Bảng màn hình ─────────────────────────
  var VIEWS = { home: vHome, ask: vAsk, places: vPlaces, memo: vMemo, memories: vMemories, book: vBook, shop: vShop, dish: vDish, cats: vCats, stats: vStats, settings: vSettings };
  var AFTER = {
    home: function () {
      if (S.home.loaded || S.home.loading) return;
      S.home.loading = true;
      Promise.all([api('getStats', {}), api('getMeals', { limit: 1 })]).then(function (r) {
        S.home.stats = r[0]; S.home.last = r[1][0] || null; S.home.loaded = true; S.home.loading = false;
        if (S.route === 'home') render();
      }).catch(function () { S.home.loading = false; S.home.loaded = true; });
    },
    places: function () { if (S.pick.loading && !S.pick.started) { S.pick.started = true; loadPlaces(); } },
    memories: function () {
      if (S.memories || S.memLoading) return;
      S.memLoading = true;
      api('getMeals', { limit: 300 }).then(function (m) {
        S.memories = m; S.memLoading = false;
        if (S.route === 'memories') render();
      }).catch(function (e) { S.memLoading = false; S.memories = []; toast(e.message, true); render(); });
    },
    stats: function () { if (!S.stats.data && !S.stats.loading) loadStats(); }
  };

  // ───────────────────────── Hành động ─────────────────────────
  var ACT = {
    startAsk: startAsk,
    choose: function (el) {
      var a = S.ask;
      a.answers.push({ question_id: a.q.id, choice: el.dataset.c });
      suggest(); render();
    },
    reject: function () { var a = S.ask; a.rejected.push(a.dish.id); a.dish = null; nextQ(); render(); },
    reroll: function () { suggest(); render(); },
    goEat: function () {
      saveSessionBg('di_luon');
      S.pick = { dish: S.ask.dish, sort: 'best', loading: true, started: false };
      go('#/places');
    },
    otherDish: function () {
      var a = S.ask;
      if (!a) { startAsk(); return; }
      a.rejected.push(S.pick.dish.id); a.dish = null; S.pick = null;
      nextQ(); if (a.phase === 'out') suggest();
      go('#/ask');
    },
    sortPlaces: function (el) { S.pick.sort = el.dataset.s; render(); },
    pickPlace: function (el) {
      var r = S.pick.result.open.filter(function (x) { return x.id === el.dataset.id; })[0];
      S.memo = { mode: 'suggested', restaurant: r, dish: S.pick.dish, photo: null, preview: null };
      go('#/memo');
    },
    selfFind: function () {
      if (S.ask) saveSessionBg('tu_tim');
      S.memo = { mode: 'self', dish: S.ask && S.ask.dish, photo: null, preview: null, back: S.route === 'places' ? '#/places' : (S.ask ? '#/ask' : '#/home') };
      go('#/memo');
    },
    newMemory: function () {
      S.ask = null;
      S.memo = { mode: 'self', photo: null, preview: null, back: '#/memories' };
      go('#/memo');
    },
    bookTab: function (el) { S.book.tab = el.dataset.t; S.book.cat = 'Tất cả'; S.book.q = ''; render(); },
    bookCat: function (el) { S.book.cat = el.dataset.c; render(); },
    openShop: function (el) { go('#/shop/' + encodeURIComponent(el.dataset.id)); },
    openDish: function (el) { go('#/dish/' + encodeURIComponent(el.dataset.id)); },
    newShop: function () { go('#/shop/new'); },
    newDish: function () { go('#/dish/new'); },
    useHere: function (el) {
      el.disabled = true;
      getPos(true).then(function (pos) {
        el.disabled = false;
        if (!pos) { toast('Không lấy được vị trí. Cá bật quyền vị trí cho trình duyệt nha', true); return; }
        var f = el.form; f.lat.value = pos.lat.toFixed(6); f.lng.value = pos.lng.toFixed(6);
        toast('Đã lấy vị trí hiện tại');
      });
    },
    delShop: function () {
      var r = S.data.restaurants.filter(function (x) { return x.id === S.param; })[0];
      if (!r || !confirm('Xóa “' + r.name + '” khỏi sổ? Kỷ niệm cũ vẫn được giữ.')) return;
      api('remove', { table: 'restaurants', id: r.id }).then(refreshData).then(function () { toast('Đã xóa ' + r.name); go('#/book'); })
        .catch(function (e) { toast(e.message, true); });
    },
    delDish: function () {
      var d = S.data.dishes.filter(function (x) { return x.id === S.param; })[0];
      if (!d || !confirm('Xóa món “' + d.name + '” khỏi sổ?')) return;
      api('remove', { table: 'dishes', id: d.id }).then(refreshData).then(function () { toast('Đã xóa ' + d.name); go('#/book'); })
        .catch(function (e) { toast(e.message, true); });
    },
    reload: function () {
      refreshData().then(function () {
        S.home.loaded = false; S.memories = null; S.stats.data = null;
        toast('Đã tải lại dữ liệu'); go('#/home');
      }).catch(function (e) { toast(e.message, true); });
    },
    resetDemo: function () {
      if (!confirm('Xóa dữ liệu dùng thử và tạo lại từ đầu?')) return;
      GasDemo.reset(); demoInit();
      S.home.loaded = false; S.memories = null; S.stats.data = null;
      refreshData().then(function () { toast('Đã đặt lại dữ liệu mẫu'); go('#/home'); });
    },
    clearScore: function (el) {
      var form = el.form; var input = form && form.elements[el.dataset.k];
      if (!input) return;
      input.dataset.empty = '1'; input.value = 0;
      var out = input.parentNode.querySelector('output'); if (out) out.textContent = '–';
      refreshOverall(form);
    },
    catTab: function (el) { S.cats.tab = el.dataset.t; S.cats.edit = null; go('#/cats/' + el.dataset.t); },
    catEdit: function (el) {
      S.cats.edit = el.dataset.id; render();
      var i = $('#cat-edit'); if (i) { i.focus(); i.select(); }
    },
    catEditCancel: function () { S.cats.edit = null; render(); },
    catMove: function (el) {
      var x = catById(el.dataset.id); if (!x) return;
      var list = catList(x.type); var i = list.indexOf(x); var j = i + Number(el.dataset.d);
      if (j < 0 || j >= list.length) return;
      list.splice(i, 1); list.splice(j, 0, x);
      // Đánh lại 1..n và chỉ gửi những phân loại có sort_order đổi (thường là 2).
      var changes = list.map(function (c, k) { return { c: c, order: k + 1 }; }).filter(function (o) { return Number(o.c.sort_order) !== o.order; });
      catOp(function () {
        return changes.reduce(function (p, o) {
          return p.then(function () { return api('update', { table: 'categories', id: o.c.id, data: { sort_order: o.order } }); });
        }, Promise.resolve());
      });
    },
    catDel: function (el) {
      var x = catById(el.dataset.id); if (!x) return;
      var n = catUsage(x.type)[lower(x.name)] || 0;
      if (n) { openReassign(x, n); return; }
      if (!confirm('Xóa phân loại “' + x.name + '”?')) return;
      catOp(function () { return api('remove', { table: 'categories', id: x.id }); }, function () { return 'Đã xóa ' + x.name; });
    },
    catDelConfirm: function (el) {
      var x = catById(el.dataset.id); var sel = $('#mdl-to');
      if (!x || !sel) return;
      var to = sel.value;
      closeModal();
      catOp(function () { return api('remove', { table: 'categories', id: x.id, reassign_to: to }); }, function (r) {
        return 'Đã xóa ' + x.name + (r && r.moved ? ', chuyển ' + r.moved + ' ' + typeWord(x.type) + ' sang “' + r.moved_to + '”' : '');
      });
    },
    modalClose: closeModal,
    showSplash: function () { showSplash(true); },
    closeSplash: function (el) { var o = el.closest('.overlay'); if (o) o.remove(); }
  };
  var CHANGE = {
    placeSel: function (el) { var box = $('#new-place'); if (box) box.hidden = el.value !== '__new'; },
    dishSel: function (el) { var box = $('#dish-other'); if (box) box.hidden = el.value !== '__other'; },
    statMonth: function (el) { S.stats.month = el.value; S.stats.data = null; loadStats(); render(); },
    mapLink: function (el) {
      var c = parseCoords(el.value);
      if (c) { el.form.lat.value = c.lat; el.form.lng.value = c.lng; toast('Đã đọc tọa độ từ link'); }
      else if (/goo\.gl|maps\.app/.test(el.value)) toast('Link rút gọn không có tọa độ. Cá nhấn giữ vào quán trên Google Maps để copy tọa độ nha', true);
    }
  };
  var FORMS = {
    memo: saveMemo,
    shop: saveShop,
    dish: saveDish,
    catAdd: function (form) {
      var name = String(new FormData(form).get('name') || '').trim();
      if (!name) return;
      var type = S.cats.tab;
      catOp(function () { return api('create', { table: 'categories', data: { type: type, name: name } }); }, function (r) { return 'Đã thêm ' + r.name; });
    },
    catRename: function (form) {
      var x = catById(form.dataset.id); if (!x) return;
      var name = String(new FormData(form).get('name') || '').trim();
      if (!name || name === x.name) { S.cats.edit = null; render(); return; }
      var n = catUsage(x.type)[lower(x.name)] || 0;
      if (n && !confirm('Đổi “' + x.name + '” thành “' + name + '”?\n' + n + ' ' + typeWord(x.type) + ' đang dùng phân loại này sẽ được đổi theo.')) return;
      catOp(function () { return api('update', { table: 'categories', id: x.id, data: { name: name } }); }, function (r) {
        return 'Đã đổi tên' + (r && r.renamed ? ', ' + r.renamed + ' ' + typeWord(x.type) + ' đổi theo' : '');
      });
    },
    token: function (form) {
      var t = String(new FormData(form).get('token') || '').trim();
      if (!t) return;
      S.token = t; S.tokenBad = false; LS.set('leeming_token', t);
      start();
    }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || !ACT[el.dataset.act]) return;
    e.preventDefault();
    ACT[el.dataset.act](el, e);
  });
  document.addEventListener('submit', function (e) {
    var f = e.target.closest('form[data-form]');
    if (!f || !FORMS[f.dataset.form]) return;
    e.preventDefault();
    FORMS[f.dataset.form](f);
  });
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.dataset && el.dataset.change && CHANGE[el.dataset.change]) { CHANGE[el.dataset.change](el); return; }
    if (el.type === 'radio' && el.name === 'rating') {
      var v = Number(el.value);
      el.closest('.stars').querySelectorAll('label').forEach(function (l, i) { l.classList.toggle('on', i < v); });
      return;
    }
    if (el.type === 'file' && el.name === 'photo' && el.files && el.files[0]) {
      compressImage(el.files[0], DEMO ? 800 : 1280).then(function (dataUrl) {
        S.memo.photo = { base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
        S.memo.preview = dataUrl;
        var drop = $('#photo-drop');
        var img = drop.querySelector('img');
        if (!img) { drop.querySelectorAll('svg,span').forEach(function (n) { n.remove(); }); img = document.createElement('img'); img.alt = 'Ảnh bữa ăn'; drop.insertBefore(img, drop.firstChild); }
        img.src = dataUrl;
      }).catch(function (err) { toast(err.message, true); });
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.dataset && e.target.dataset.input === 'score') {
      var el = e.target; delete el.dataset.empty;
      var out = el.parentNode.querySelector('output'); if (out) out.textContent = fmtScore(el.value);
      refreshOverall(el.form);
      return;
    }
    if (e.target.dataset && e.target.dataset.input === 'bookq') {
      S.book.q = e.target.value;
      var box = $('#book-list'); if (box) box.innerHTML = bookList();
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  document.addEventListener('click', function (e) { if (e.target.classList && e.target.classList.contains('modal')) closeModal(); });
  window.addEventListener('hashchange', route);

  // ───────────────────────── Khởi động ─────────────────────────
  function fatal(msg) {
    $('#app').innerHTML = '<section class="screen"><div class="ask-body center"><span class="h1">Ối, có lỗi rồi</span>' +
      '<span class="muted">' + esc(msg) + '</span><button class="btn btn-primary" onclick="location.reload()">Thử lại</button></div></section>';
  }
  function start() {
    if (!DEMO && !S.token) { S.route = 'token'; render(); return; }
    var cached = !DEMO && LS.get('leeming_cache', null);
    if (cached && !S.data) { S.data = cached; route(); }
    refreshData().then(function () {
      if (S.route === 'token') S.route = '';
      route();
      showSplash(false);
    }).catch(function (e) {
      if (S.tokenBad) { S.data = null; LS.del('leeming_cache'); S.route = 'token'; render(); return; }
      if (S.data) toast('Đang xem dữ liệu đã lưu trên máy. ' + e.message, true);
      else fatal(e.message);
    });
  }
  function boot() {
    var k = new URLSearchParams(location.search).get('k');
    if (k) {
      LS.set('leeming_token', k);
      history.replaceState(null, '', location.pathname + location.hash);
    }
    S.token = LS.get('leeming_token', null);
    loadBackend().then(function () {
      if (DEMO) demoInit();
      start();
    }).catch(function (e) { fatal(e.message); });
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* không bắt buộc */ });
    }
  }
  boot();
})();
