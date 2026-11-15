/**
 * 台中全時間百寶箱後端（Google Apps Script + Google Sheet）
 *
 * 公開：
 *   GET  ?action=list[&callback=fn]   已核准清單（JSON；有 callback 時回 JSONP）
 *   POST {action:'submit', name, url, description, website, client}  投稿（狀態 pending）
 * 管理：
 *   GET  ?page=admin                  審核頁（HtmlService）；所有審核動作都要通過驗證
 *
 * Script Properties（專案設定 → 指令碼屬性，自行設定，不寫在程式裡）：
 *   SHEET_ID        setup() 自動寫入
 *   ADMIN_EMAIL     允許的管理者 Google 帳號（逗號分隔；預設 isaiah.overcomer@gmail.com）
 *   ADMIN_PASSWORD  管理密碼（建議 16 字以上；只存在這裡）
 *
 * 名稱結尾為底線的函式是私有函式，google.script.run 無法呼叫。
 */

var SHEET_NAME = 'links';
var HEADERS = ['id', 'created_at', 'name', 'url', 'description', 'status', 'reviewed_at', 'reviewer', 'client_hash'];
var LIMITS = { name: 80, url: 500, description: 300 };
var STATUSES = ['pending', 'approved', 'rejected'];
var DEFAULT_ADMIN_EMAIL = 'isaiah.overcomer@gmail.com';
var RATE = { perClientPerHour: 5, globalPerHour: 60 };
var SESSION_SECONDS = 2 * 60 * 60;
var LOGIN_FAIL_MAX = 8;
var LIST_CACHE_KEY = 'approved-list-v1';

/* ---------------- setup ---------------- */

/** 在 Apps Script 編輯器中手動執行一次：建立試算表，並把 ID 存到 Script Properties。 */
function setup() {
  var owner = Session.getEffectiveUser().getEmail();
  var active = Session.getActiveUser().getEmail();
  if (!owner || owner !== active) throw new Error('只能由專案擁有者在編輯器中執行 setup。');

  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SHEET_ID')) {
    Logger.log('已設定過試算表，略過建立。');
    return;
  }
  var ss = SpreadsheetApp.create('台中全時間百寶箱投稿');
  var sh = ss.getSheets()[0];
  sh.setName(SHEET_NAME);
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.getRange('A:I').setNumberFormat('@');
  props.setProperty('SHEET_ID', ss.getId());
  if (!props.getProperty('ADMIN_EMAIL')) props.setProperty('ADMIN_EMAIL', DEFAULT_ADMIN_EMAIL);
  Logger.log('已建立試算表。請到「專案設定 → 指令碼屬性」自行新增 ADMIN_PASSWORD。');
}

/* ---------------- web entry points ---------------- */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.page === 'admin') {
    return HtmlService.createHtmlOutputFromFile('Admin')
      .setTitle('台中全時間百寶箱｜審核')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (p.action === 'list') {
    return output_({ ok: true, items: approvedList_() }, p.callback);
  }
  return output_({ ok: false, error: 'unknown_action' }, p.callback);
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    body = (e && e.parameter) || {};
  }
  if (body.action !== 'submit') return output_({ ok: false, error: 'unknown_action' });
  return output_(submit_(body));
}

function output_(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback !== undefined) {
    if (!/^[A-Za-z_$][\w$]{0,63}$/.test(String(callback))) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'bad_callback' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput('/**/' + callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- validation ---------------- */

function cleanText_(v, max) {
  var s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length > max) return null;
  if (/<\s*\/?\s*(script|iframe|object|embed|svg|img|style)\b|javascript:|data:text\/html|\bon[a-z]+\s*=/i.test(s)) return null;
  return s;
}

function cleanUrl_(v) {
  var s = String(v == null ? '' : v).trim();
  if (!s || s.length > LIMITS.url) return null;
  var m = /^(https?):\/\/([^\/?#\s<>"'`]+)([^\s<>"'`]*)$/i.exec(s);
  if (!m) return null;
  var host = m[2].replace(/^[^@]*@/, '').replace(/:\d+$/, '').toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(host) && !/^xn--/.test(host)) return null;
  if (host.indexOf('.') < 0) return null;
  return s;
}

function safeCell_(s) {
  // 避免被試算表當成公式
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/* ---------------- public: submit ---------------- */

function submit_(body) {
  // 蜜罐欄位：有填就回成功，但不寫入
  if (body.website) return { ok: true };

  var name = cleanText_(body.name, LIMITS.name);
  if (!name) return { ok: false, error: 'invalid_name' };
  var url = cleanUrl_(body.url);
  if (!url) return { ok: false, error: 'invalid_url' };
  var desc = cleanText_(body.description, LIMITS.description);
  if (desc === null) return { ok: false, error: 'invalid_description' };

  // Apps Script 拿不到訪客 IP：以瀏覽器端隨機 ID（雜湊後）做個別限制，再加全域上限。
  var client = /^[a-z0-9]{12,40}$/.test(String(body.client || '')) ? String(body.client) : 'anon';
  var clientHash = sha256_(client).slice(0, 16);
  if (!rateOk_('rate:c:' + clientHash, RATE.perClientPerHour) || !rateOk_('rate:all', RATE.globalPerHour)) {
    return { ok: false, error: 'rate_limited' };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'busy' };
  try {
    var sh = sheet_();
    sh.appendRow([
      Utilities.getUuid(),
      new Date().toISOString(),
      safeCell_(name),
      safeCell_(url),
      safeCell_(desc),
      'pending',
      '',
      '',
      clientHash,
    ]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function rateOk_(key, max) {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get(key) || 0);
  if (n >= max) return false;
  cache.put(key, String(n + 1), 3600);
  return true;
}

/* ---------------- public: list ---------------- */

function approvedList_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(LIST_CACHE_KEY);
  if (hit) return JSON.parse(hit);
  var items = readRows_()
    .filter(function (r) { return r.status === 'approved' && cleanUrl_(r.url); })
    .map(function (r) { return { name: r.name, url: r.url, description: r.description }; });
  cache.put(LIST_CACHE_KEY, JSON.stringify(items), 300);
  return items;
}

/* ---------------- sheet helpers ---------------- */

function sheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('尚未執行 setup()');
  return SpreadsheetApp.openById(id).getSheetByName(SHEET_NAME);
}

function readRows_() {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, HEADERS.length).getDisplayValues();
  return values.map(function (v, i) {
    var o = { row: i + 2 };
    HEADERS.forEach(function (h, j) { o[h] = String(v[j]); });
    return o;
  });
}

function findRow_(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  var rows = readRows_();
  for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
  return null;
}

/* ---------------- admin auth ---------------- */

function sha256_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function adminEmails_() {
  var raw = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL') || DEFAULT_ADMIN_EMAIL;
  return raw.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(String);
}

function newSession_(who) {
  var token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('adm:' + sha256_(token), who, SESSION_SECONDS);
  return token;
}

function requireAdmin_(token) {
  if (typeof token !== 'string' || token.length < 40 || token.length > 100) throw new Error('請重新登入。');
  var who = CacheService.getScriptCache().get('adm:' + sha256_(token));
  if (!who) throw new Error('請重新登入。');
  return who;
}

/** 審核頁開啟時呼叫：若以允許的 Google 帳號開啟，直接給 session。 */
function adminWhoami() {
  var email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (email && adminEmails_().indexOf(email) >= 0) return { ok: true, token: newSession_(email), who: email };
  return { ok: false };
}

/** 以管理密碼登入（密碼只與 Script Properties 比對，不記錄、不回傳）。 */
function adminLogin(password) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('adm:fails') || 0);
  if (fails >= LOGIN_FAIL_MAX) return { ok: false, error: '嘗試次數太多，請 15 分鐘後再試。' };

  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD') || '';
  var given = typeof password === 'string' ? password : '';
  if (expected.length < 8 || !given) {
    cache.put('adm:fails', String(fails + 1), 900);
    return { ok: false, error: expected.length < 8 ? '管理密碼尚未設定。' : '密碼錯誤。' };
  }
  var a = sha256_(expected);
  var b = sha256_(given);
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  if (diff !== 0) {
    cache.put('adm:fails', String(fails + 1), 900);
    return { ok: false, error: '密碼錯誤。' };
  }
  return { ok: true, token: newSession_('admin-password') };
}

function adminLogout(token) {
  if (typeof token === 'string') CacheService.getScriptCache().remove('adm:' + sha256_(token));
  return { ok: true };
}

/* ---------------- admin actions（都需要 token） ---------------- */

function adminList(token) {
  requireAdmin_(token);
  var rows = readRows_().map(function (r) {
    return {
      id: r.id, created_at: r.created_at, name: r.name, url: r.url,
      description: r.description, status: r.status, reviewed_at: r.reviewed_at, reviewer: r.reviewer,
    };
  });
  rows.reverse();
  return { ok: true, items: rows };
}

function adminSetStatus(token, id, status) {
  var who = requireAdmin_(token);
  if (STATUSES.indexOf(status) < 0 || status === 'pending') throw new Error('狀態不正確。');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var r = findRow_(id);
    if (!r) throw new Error('找不到這筆資料。');
    var sh = sheet_();
    sh.getRange(r.row, HEADERS.indexOf('status') + 1, 1, 3).setValues([[status, new Date().toISOString(), who]]);
  } finally {
    lock.releaseLock();
  }
  CacheService.getScriptCache().remove(LIST_CACHE_KEY);
  return { ok: true };
}

function adminDelete(token, id) {
  requireAdmin_(token);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var r = findRow_(id);
    if (!r) throw new Error('找不到這筆資料。');
    sheet_().deleteRow(r.row);
  } finally {
    lock.releaseLock();
  }
  CacheService.getScriptCache().remove(LIST_CACHE_KEY);
  return { ok: true };
}
