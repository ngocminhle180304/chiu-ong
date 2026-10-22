/* ------------------------------------------------------------------
 * Ngữ cảnh cho gợi ý: vị trí, thời tiết (Open-Meteo), quán quanh đây
 * (OpenStreetMap/Overpass) và lựa chọn tay (tâm trạng, dịp, bán kính).
 *  - Gọi dịch vụ ngoài từ trình duyệt (có CORS, không cần key).
 *  - Lỗi mạng / không có GPS / từ chối quyền → trả null hoặc [] chứ
 *    không ném lỗi, để app vẫn chạy bình thường.
 *  - Tọa độ gửi ra ngoài được làm tròn 2 chữ số (~1 km).
 * ------------------------------------------------------------------ */
(function (global) {
  'use strict';
  var STATE_KEY = 'leeming_ctx_v1';
  var WEATHER_TTL = 15 * 60 * 1000;
  var PLACES_TTL = 30 * 60 * 1000;
  var POS_MAX_AGE = 5 * 60 * 1000;
  var OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

  function today() { return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd'); }
  function store(kind) { try { return global[kind]; } catch (e) { return null; } }
  function getJson(kind, k) { var s = store(kind); try { var v = s && s.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function setJson(kind, k, v) { var s = store(kind); try { if (s) s.setItem(k, JSON.stringify(v)); } catch (e) { /* đầy / riêng tư */ } }
  function round2(x) { return Math.round(Number(x) * 100) / 100; }

  /** Trạng thái chọn tay. Tâm trạng, dịp và thời tiết chọn tay chỉ có hiệu lực trong ngày; bán kính thì nhớ lâu. */
  var state = (function () {
    var s = getJson('localStorage', STATE_KEY) || {};
    var fresh = { day: today(), moods: [], occasions: [], occasions_off: [], weather_override: null };
    if (s.day !== fresh.day) s = Object.assign(s, fresh);
    if (!('radius_km' in s)) s.radius_km = undefined;
    return s;
  })();
  function save() { state.day = today(); setJson('localStorage', STATE_KEY, state); }

  function withTimeout(ms) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, ms);
    return { signal: ctl ? ctl.signal : undefined, done: function () { clearTimeout(timer); } };
  }

  // ── Vị trí ──
  var pos = null;
  function getLocation(fresh) {
    return new Promise(function (resolve) {
      if (!global.navigator || !navigator.geolocation) return resolve(null);
      if (!fresh && pos && Date.now() - pos.t < POS_MAX_AGE) return resolve(pos);
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve(pos); } }, 9000);
      navigator.geolocation.getCurrentPosition(function (p) {
        if (done) return; done = true; clearTimeout(timer);
        pos = { lat: p.coords.latitude, lng: p.coords.longitude, t: Date.now() };
        resolve(pos);
      }, function () {
        if (done) return; done = true; clearTimeout(timer); resolve(null);
      }, { enableHighAccuracy: true, timeout: 8000, maximumAge: POS_MAX_AGE });
    });
  }
  /** 'granted' | 'denied' | 'prompt' | 'unknown' — để chỉ hỏi quyền khi người dùng bấm. */
  function locationPermission() {
    if (!global.navigator || !navigator.permissions || !navigator.permissions.query) return Promise.resolve('unknown');
    return navigator.permissions.query({ name: 'geolocation' }).then(function (r) { return r.state; }, function () { return 'unknown'; });
  }

  // ── Thời tiết: Open-Meteo, cache 15 phút trong phiên ──
  var weatherInflight = {};
  function fetchWeather(lat, lng) {
    if (lat == null || lng == null || isNaN(Number(lat)) || isNaN(Number(lng))) return Promise.resolve(null);
    var la = round2(lat); var ln = round2(lng);
    var key = 'leeming_wx_' + la + ',' + ln;
    var hit = getJson('sessionStorage', key);
    if (hit && Date.now() - hit.t < WEATHER_TTL) return Promise.resolve(hit.data);
    if (weatherInflight[key]) return weatherInflight[key];
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + la + '&longitude=' + ln +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code' +
      '&hourly=precipitation_probability&forecast_hours=3&timezone=Asia%2FBangkok';
    var to = withTimeout(8000);
    weatherInflight[key] = fetch(url, { signal: to.signal }).then(function (r) {
      if (!r.ok) throw new Error('weather ' + r.status);
      return r.json();
    }).then(function (j) {
      var c = j.current || {};
      var probs = ((j.hourly || {}).precipitation_probability || []).slice(0, 3).filter(function (x) { return x != null; });
      var data = {
        temp: c.temperature_2m, apparent: c.apparent_temperature, humidity: c.relative_humidity_2m,
        precip: c.precipitation, weather_code: c.weather_code,
        rain_prob: probs.length ? Math.max.apply(null, probs) : null
      };
      if (data.temp == null) return null;
      setJson('sessionStorage', key, { t: Date.now(), data: data });
      return data;
    }).catch(function () { return null; }).then(function (d) { to.done(); delete weatherInflight[key]; return d; });
    return weatherInflight[key];
  }

  // ── Quán quanh đây: OpenStreetMap qua Overpass, cache 30 phút ──
  var placesInflight = {};
  function overpassQuery(lat, lng, meters) {
    return '[out:json][timeout:10];(' +
      'nwr["amenity"~"^(restaurant|cafe|fast_food|food_court)$"]["name"](around:' + meters + ',' + lat + ',' + lng + ');' +
      ');out center 30;';
  }
  function fetchNearbyPlaces(lat, lng, radiusKm) {
    if (lat == null || lng == null) return Promise.resolve([]);
    var la = round2(lat); var ln = round2(lng);
    var meters = Math.round(Math.min(Math.max(Number(radiusKm) || 3, 0.5), 5) * 1000);
    var key = 'leeming_osm_' + la + ',' + ln + ',' + meters;
    var hit = getJson('sessionStorage', key);
    if (hit && Date.now() - hit.t < PLACES_TTL) return Promise.resolve(hit.data);
    if (placesInflight[key]) return placesInflight[key];
    var q = overpassQuery(la, ln, meters);
    var tryAt = function (i) {
      if (i >= OVERPASS.length) return Promise.resolve(null);
      var to = withTimeout(10000);
      return fetch(OVERPASS[i], {
        method: 'POST', signal: to.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: 'data=' + encodeURIComponent(q)
      }).then(function (r) {
        to.done();
        if (!r.ok) throw new Error('overpass ' + r.status);
        return r.json();
      }).catch(function () { to.done(); return tryAt(i + 1); });
    };
    placesInflight[key] = tryAt(0).then(function (j) {
      var list = ((j && j.elements) || []).map(function (e) {
        var t = e.tags || {};
        var plat = e.lat != null ? e.lat : (e.center && e.center.lat);
        var plng = e.lon != null ? e.lon : (e.center && e.center.lon);
        if (!t.name || plat == null || plng == null) return null;
        return {
          osm_id: e.type + '/' + e.id, name: t.name, lat: plat, lng: plng, amenity: t.amenity || '', cuisine: t.cuisine || '',
          address: [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '),
          opening_hours: t.opening_hours || ''
        };
      }).filter(Boolean);
      if (j) setJson('sessionStorage', key, { t: Date.now(), data: list });
      return list;
    }).catch(function () { return []; }).then(function (l) { delete placesInflight[key]; return l; });
    return placesInflight[key];
  }

  // ── Tra 1 quán cụ thể trên OpenStreetMap (bổ sung khi lấy thông tin từ link Google Maps) ──
  function normName(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  /** Quán có tên gần giống `name` trong bán kính ~80 m quanh (lat, lng); không thấy thì quán ăn gần nhất trong ~25 m. */
  function lookupOsmPlace(lat, lng, name) {
    if (lat == null || lng == null) return Promise.resolve(null);
    var q = '[out:json][timeout:10];(nwr["amenity"~"^(restaurant|cafe|fast_food|food_court|bar|pub|ice_cream)$"](around:80,' +
      Number(lat).toFixed(6) + ',' + Number(lng).toFixed(6) + '););out center 20;';
    var tryAt = function (i) {
      if (i >= OVERPASS.length) return Promise.resolve(null);
      var to = withTimeout(10000);
      return fetch(OVERPASS[i], { method: 'POST', signal: to.signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: 'data=' + encodeURIComponent(q) })
        .then(function (r) { to.done(); if (!r.ok) throw new Error('overpass ' + r.status); return r.json(); })
        .catch(function () { to.done(); return tryAt(i + 1); });
    };
    return tryAt(0).then(function (j) {
      var want = normName(name);
      var list = ((j && j.elements) || []).map(function (e) {
        var t = e.tags || {};
        var plat = e.lat != null ? e.lat : (e.center && e.center.lat); var plng = e.lon != null ? e.lon : (e.center && e.center.lon);
        var dLat = (plat - lat) * 111000; var dLng = (plng - lng) * 111000 * Math.cos(lat * Math.PI / 180);
        var n = normName(t.name);
        return {
          name: t.name || '', amenity: t.amenity || '', cuisine: t.cuisine || '', opening_hours: t.opening_hours || '',
          address: [[t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '), t['addr:district'] || t['addr:subdistrict'], t['addr:city']].filter(Boolean).join(', '),
          dist: Math.sqrt(dLat * dLat + dLng * dLng),
          match: !!(want && n && (n === want || n.indexOf(want) >= 0 || want.indexOf(n) >= 0))
        };
      }).sort(function (a, b) { return (b.match - a.match) || (a.dist - b.dist); });
      var best = list[0];
      return best && (best.match || best.dist <= 25) ? best : null;
    }).catch(function () { return null; });
  }
  /** Tọa độ → địa chỉ (Nominatim của OpenStreetMap). Lỗi thì trả null. */
  function reverseAddress(lat, lng) {
    if (lat == null || lng == null) return Promise.resolve(null);
    var to = withTimeout(8000);
    return fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=vi&lat=' + Number(lat).toFixed(6) + '&lon=' + Number(lng).toFixed(6), { signal: to.signal })
      .then(function (r) { to.done(); if (!r.ok) throw new Error('nominatim ' + r.status); return r.json(); })
      .then(function (j) {
        var a = (j && j.address) || {};
        var parts = [[a.house_number, a.road].filter(Boolean).join(' '), a.quarter || a.suburb, a.city_district || a.district, a.city || a.town || a.state].filter(Boolean);
        return parts.length ? parts.join(', ') : ((j && j.display_name) || null);
      }).catch(function () { to.done(); return null; });
  }

  /** Ngữ cảnh thô gửi kèm khi gợi ý (backend tự suy ra luật). */
  function payload(mode, extra) {
    var p = {
      mode: mode, weather: extra && extra.weather || null, weather_override: state.weather_override || null,
      moods: state.moods.slice(), occasions: state.occasions.slice(), occasions_off: state.occasions_off.slice()
    };
    if (state.radius_km !== undefined) p.radius_km = state.radius_km;
    if (extra && extra.pos) { p.lat = extra.pos.lat; p.lng = extra.pos.lng; }
    return p;
  }

  global.Ctx = {
    state: state, save: save,
    getLocation: getLocation, locationPermission: locationPermission, lastPosition: function () { return pos; },
    fetchWeather: fetchWeather, fetchNearbyPlaces: fetchNearbyPlaces, payload: payload,
    lookupOsmPlace: lookupOsmPlace, reverseAddress: reverseAddress
  };
})(window);
