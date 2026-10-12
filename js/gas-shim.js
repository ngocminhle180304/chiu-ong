/* ------------------------------------------------------------------
 * Lớp giả lập Google Apps Script chạy trong trình duyệt.
 *  - Luôn cung cấp `Utilities` để app dùng chung logic gợi ý trong
 *    backend/Code.gs (một nguồn logic duy nhất cho cả server và app).
 *  - Ở CHẾ ĐỘ DÙNG THỬ (chưa có API_URL), giả lập luôn Google Sheet
 *    bằng localStorage để app chạy được mà không cần deploy.
 * ------------------------------------------------------------------ */
(function (global) {
  'use strict';
  var TZ = 'Asia/Ho_Chi_Minh';
  var fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hour12: false
  });
  function parts(d) {
    var o = {};
    fmt.formatToParts(d).forEach(function (p) { o[p.type] = p.value; });
    if (o.hour === '24') o.hour = '00';
    return o;
  }
  function uuid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  global.Utilities = {
    formatDate: function (d, tz, pat) {
      var p = parts(d);
      var dow = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday];
      switch (pat) {
        case "yyyy-MM-dd'T'HH:mm:ssXXX": return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':' + p.second + '+07:00';
        case 'yyyy-MM-dd': return p.year + '-' + p.month + '-' + p.day;
        case 'HH:mm': return p.hour + ':' + p.minute;
        case 'H': return String(Number(p.hour));
        case 'm': return String(Number(p.minute));
        case 'u': return String(dow);
        default: throw new Error('Định dạng ngày chưa hỗ trợ: ' + pat);
      }
    },
    getUuid: uuid,
    base64Decode: function (s) { return { b64: s }; },
    newBlob: function (data, mime, name) { return { b64: data.b64, mime: mime, name: name }; }
  };

  global.ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput: function (s) { return { text: s, getContent: function () { return s; }, setMimeType: function () { return this; } }; }
  };
  global.LockService = { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };

  // ── Google Sheet giả lập (chỉ dùng ở chế độ dùng thử) ──
  var STORE_KEY = 'leeming_demo_sheets_v1';
  var PHOTO_KEY = 'leeming_demo_photos_v1';
  var sheets = {};
  var props = { API_TOKEN: 'demo' };

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      var obj = JSON.parse(raw);
      Object.keys(obj).forEach(function (n) { sheets[n] = new Sheet(n, obj[n]); });
      return true;
    } catch (e) { return false; }
  }
  function save() {
    var obj = {};
    Object.keys(sheets).forEach(function (n) { obj[n] = sheets[n].rows; });
    try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); } catch (e) { console.warn('Không lưu được dữ liệu dùng thử', e); }
  }

  function Range(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr || 1; this.nc = nc || 1; }
  Range.prototype.getValues = function () {
    var out = [];
    for (var i = 0; i < this.nr; i++) {
      var row = [];
      for (var j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j));
      out.push(row);
    }
    return out;
  };
  Range.prototype.setValues = function (v) {
    var self = this;
    v.forEach(function (row, i) { row.forEach(function (x, j) { self.sh.set(self.r + i, self.c + j, x); }); });
    return this;
  };
  Range.prototype.setValue = function (x) { this.sh.set(this.r, this.c, x); return this; };
  ['setFontWeight', 'setBackground', 'setFontColor', 'setDataValidation', 'setNumberFormat'].forEach(function (m) {
    Range.prototype[m] = function () { return this; };
  });

  function Sheet(name, rows) { this.name = name; this.rows = rows || []; }
  Sheet.prototype.get = function (r, c) {
    var row = this.rows[r - 1];
    var v = row ? row[c - 1] : undefined;
    return (v === undefined || v === null) ? '' : v;
  };
  Sheet.prototype.set = function (r, c, v) {
    while (this.rows.length < r) this.rows.push([]);
    if (typeof v === 'string' && v.charAt(0) === "'") v = v.slice(1);
    this.rows[r - 1][c - 1] = v;
  };
  Sheet.prototype.getLastRow = function () {
    for (var i = this.rows.length; i > 0; i--) {
      if (this.rows[i - 1].some(function (v) { return v !== '' && v !== undefined && v !== null; })) return i;
    }
    return 0;
  };
  Sheet.prototype.getLastColumn = function () {
    return this.rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
  };
  Sheet.prototype.getRange = function (r, c, nr, nc) { return new Range(this, r, c, nr, nc); };
  Sheet.prototype.getDataRange = function () { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); };
  Sheet.prototype.appendRow = function (vals) {
    var r = this.getLastRow() + 1; var self = this;
    vals.forEach(function (v, j) { self.set(r, j + 1, v); });
  };
  Sheet.prototype.deleteRow = function (r) { this.rows.splice(r - 1, 1); };
  Sheet.prototype.setFrozenRows = function () {};

  var spreadsheet = {
    getSheetByName: function (n) { return sheets[n] || null; },
    insertSheet: function (n) { sheets[n] = new Sheet(n); return sheets[n]; },
    getSheets: function () { return Object.keys(sheets).map(function (k) { return sheets[k]; }); },
    deleteSheet: function (s) { delete sheets[s.name]; },
    toast: function () {}
  };

  function photos() { try { return JSON.parse(localStorage.getItem(PHOTO_KEY) || '{}'); } catch (e) { return {}; } }

  global.SpreadsheetApp = {
    getActive: function () { return spreadsheet; },
    newDataValidation: function () { return { requireCheckbox: function () { return this; }, build: function () { return {}; } }; },
    getUi: function () { throw new Error('Không có giao diện Sheet'); }
  };
  global.PropertiesService = {
    getScriptProperties: function () {
      return { getProperty: function (k) { return props[k] || null; }, setProperty: function (k, v) { props[k] = v; } };
    }
  };
  function demoFolder(id) {
    return {
      getId: function () { return id; },
      createFile: function (blob) {
        var fid = 'demo-' + uuid().slice(0, 8);
        var all = photos(); all[fid] = 'data:' + blob.mime + ';base64,' + blob.b64;
        try { localStorage.setItem(PHOTO_KEY, JSON.stringify(all)); } catch (e) { console.warn('Bộ nhớ ảnh dùng thử đã đầy'); }
        return { getId: function () { return fid; }, setSharing: function () {} };
      }
    };
  }
  global.DriveApp = {
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
    Permission: { VIEW: 'VIEW' },
    getFolderById: function (id) { return demoFolder(id); },
    createFolder: function () { return demoFolder('demo-folder'); }
  };

  global.GasDemo = {
    hasData: function () { return load(); },
    save: save,
    photo: function (fileId) { return photos()[fileId] || null; },
    reset: function () {
      try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(PHOTO_KEY); } catch (e) { /* ignore */ }
      Object.keys(sheets).forEach(function (k) { delete sheets[k]; });
    }
  };
})(window);
