(function () {
  const cfg = window.TOOLBOX_CONFIG || {};
  const LIMITS = { name: 80, url: 500, description: 300 };
  const status = document.getElementById('status');
  let timer = 0;

  function say(text) {
    status.textContent = text;
    clearTimeout(timer);
    timer = setTimeout(() => { status.textContent = ''; }, 4000);
  }

  // 只接受 http:// 或 https:// 的完整網址；其餘（javascript:、data:、沒有協定的字）一律回傳 null。
  function safeUrl(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s || s.length > LIMITS.url) return null;
    if (!/^https?:\/\//i.test(s)) return null;
    if (/[\s\u0000-\u001f\u007f<>"]/.test(s)) return null;
    let u;
    try { u = new URL(s); } catch (e) { return null; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname || (!u.hostname.includes('.') && u.hostname !== 'localhost')) return null;
    return u.href;
  }

  function apiBase() {
    const raw = typeof cfg.API_URL === 'string' ? cfg.API_URL.trim() : '';
    if (!raw) return '';
    const ok = safeUrl(raw);
    return ok && ok.startsWith('https://') ? ok : '';
  }

  /* ---------- 複製網址 ---------- */
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest && ev.target.closest('.btn-copy');
    if (!btn) return;
    const url = btn.dataset.url;
    let ok = false;
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(url); ok = true; } catch (e) { ok = false; }
    }
    if (!ok) ok = fallbackCopy(url);
    if (ok) {
      say('已複製網址，可以貼到 LINE 群組。');
      btn.textContent = '已複製';
      setTimeout(() => { btn.textContent = '複製網址'; }, 2500);
    } else {
      window.prompt('請長按複製這個網址：', url);
    }
  });

  /* ---------- 已審核連結 ---------- */
  const shared = document.getElementById('shared');
  const sharedList = document.getElementById('shared-list');
  const listStatus = document.getElementById('list-status');

  function clip(s, n) {
    return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
  }

  function makeCard(item) {
    const li = document.createElement('li');
    li.className = 'tool tool-shared';

    const h = document.createElement('h2');
    h.textContent = item.name;
    li.appendChild(h);

    const p = document.createElement('p');
    p.className = 'tool-desc';
    p.textContent = item.description;
    li.appendChild(p);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const a = document.createElement('a');
    a.className = 'btn btn-open';
    a.setAttribute('href', item.url);
    a.setAttribute('rel', 'noopener noreferrer');
    a.setAttribute('aria-label', '打開 ' + item.name);
    a.textContent = '打開';
    const b = document.createElement('button');
    b.className = 'btn btn-copy';
    b.type = 'button';
    b.dataset.url = item.url;
    b.setAttribute('aria-label', '複製 ' + item.name + ' 網址');
    b.textContent = '複製網址';
    actions.appendChild(a);
    actions.appendChild(b);
    li.appendChild(actions);
    return li;
  }

  /* ---------- 首頁共用連結 ---------- */
  // 常用研讀與召會事務在前，分享工具與內容接續；未列出的項目保留資料原順序。
  const CATEGORY_ORDER = ['bible', 'church', 'line-cards', 'music', 'family', 'social', 'info'];
  const ITEM_ORDER = {
    bible: ['morning-revival-today-site', 'interlinear-bible'],
    church: ['forms-app-web', '2026-tcchlife-pyramid', '2026-twyp-chlife'],
    'line-cards': ['line-tools', 'line-signup', 'line-link-card', 'line-love-letter', 'fulltime-weekly-report'],
    music: ['isaiahs-garden', 'numbered-score-studio'],
    family: ['family-story-365', 'gospel-tracts-animation', 'curd-honey-bible-journey'],
    social: ['youtube', 'soundcloud', 'blog', 'facebook', 'instagram'],
    info: ['privacy', 'terms'],
  };

  function ordered(items, order) {
    const rank = (id) => order.includes(id) ? order.indexOf(id) : order.length;
    return [...items].sort((a, b) => rank(a.id) - rank(b.id));
  }

  async function loadBuiltins() {
    const message = document.getElementById('builtin-status');
    try {
      const data = await fetchJson('../links.json', 10000);
      const root = new URL('../', location.href);
      const self = new URL('./', location.href);
      const groups = [
        ...data.categories,
        { id: 'social', title: '社群連結', items: data.social || [] },
        { id: 'info', title: '網站資訊', items: Object.entries(data.footer || {})
          .filter(([, item]) => item && item.url).map(([id, item]) => ({ ...item, id })) },
      ];
      const sections = [];
      for (const group of ordered(groups, CATEGORY_ORDER)) {
        const cards = [];
        for (const item of ordered(group.items, ITEM_ORDER[group.id] || [])) {
          const url = new URL(item.url, root);
          if (!/^https?:$/.test(url.protocol)) continue;
          if (url.origin === self.origin && url.pathname.replace(/index\.html$/, '').replace(/\/$/, '') === self.pathname.replace(/\/$/, '')) continue;
          const card = makeCard({ name: item.title, description: item.description || '', url: url.href });
          card.className = 'tool tool-signup';
          card.querySelector('h2').replaceWith(Object.assign(document.createElement('h3'), { textContent: item.title }));
          cards.push(card);
        }
        if (!cards.length) continue;
        const section = document.createElement('section');
        section.className = 'category';
        const heading = document.createElement('h2');
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'category-toggle';
        toggle.textContent = group.title;
        toggle.setAttribute('aria-expanded', 'true');
        heading.append(toggle);
        const list = document.createElement('ol');
        list.className = 'tools';
        list.id = `category-tools-${sections.length}`;
        toggle.setAttribute('aria-controls', list.id);
        toggle.addEventListener('click', () => {
          list.hidden = !list.hidden;
          toggle.setAttribute('aria-expanded', String(!list.hidden));
        });
        list.append(...cards);
        section.append(heading, list);
        sections.push(section);
      }
      document.getElementById('builtin').replaceChildren(...sections);
      message.textContent = '';
    } catch (e) {
      message.textContent = '目前無法讀取全部連結，請確認網路後重新整理。';
    }
  }
  loadBuiltins();

  function renderShared(data) {
    const rows = Array.isArray(data && data.items) ? data.items : [];
    const items = [];
    for (const r of rows.slice(0, 200)) {
      if (!r || typeof r !== 'object') continue;
      const url = safeUrl(r.url);
      const name = clip(r.name, LIMITS.name);
      if (!url || !name) continue;
      items.push({ name, url, description: clip(r.description, LIMITS.description) });
    }
    sharedList.replaceChildren(...items.map(makeCard));
    shared.hidden = items.length === 0;
    listStatus.textContent = '';
  }

  function fetchJson(url, ms) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), ms) : 0;
    return fetch(url, { cache: 'no-store', credentials: 'omit', signal: ctrl ? ctrl.signal : undefined })
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .finally(() => clearTimeout(t));
  }

  // 跨網域讀取失敗時的後備：JSONP（後端只接受安全的 callback 名稱）
  function jsonp(url, ms) {
    return new Promise((resolve, reject) => {
      const name = '__toolboxList' + Math.random().toString(36).slice(2, 10);
      const s = document.createElement('script');
      const done = (fn, v) => {
        clearTimeout(t);
        delete window[name];
        s.remove();
        fn(v);
      };
      const t = setTimeout(() => done(reject, new Error('timeout')), ms);
      window[name] = (data) => done(resolve, data);
      s.onerror = () => done(reject, new Error('jsonp'));
      s.src = url + '&callback=' + name;
      document.head.appendChild(s);
    });
  }

  function loadShared(base) {
    const url = base + (base.includes('?') ? '&' : '?') + 'action=list';
    listStatus.textContent = '正在讀取推薦連結…';
    return fetchJson(url, 10000)
      .catch(() => jsonp(url, 10000))
      .then((data) => {
        if (!data || data.ok === false) throw new Error('bad data');
        renderShared(data);
      })
      .catch(() => {
        shared.hidden = true;
        listStatus.textContent = '目前無法讀取推薦連結，上方首頁連結仍可正常使用。';
      });
  }

  /* ---------- 新增連結表單 ---------- */
  const form = document.getElementById('submit-form');
  const closed = document.getElementById('submit-closed');
  const formError = document.getElementById('form-error');
  const formStatus = document.getElementById('form-status');
  const sendBtn = document.getElementById('send');

  const messages = {
    rate_limited: '送出次數太多，請過一小時再試。',
    invalid_url: '網址格式不正確，請用 http:// 或 https:// 開頭的完整網址。',
    invalid_name: '請填寫名稱（80 字內）。',
    invalid_description: '說明請在 300 字內。',
    busy: '系統忙碌中，請稍後再試。',
  };

  function clientId() {
    try {
      let id = localStorage.getItem('toolbox-client');
      if (!id || !/^[a-z0-9]{12,40}$/.test(id)) {
        id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (x) => x.toString(16).padStart(2, '0')).join('');
        localStorage.setItem('toolbox-client', id);
      }
      return id;
    } catch (e) {
      return '';
    }
  }

  function validate() {
    const name = form.elements.name.value.trim();
    const rawUrl = form.elements.url.value.trim();
    const description = form.elements.description.value.trim();
    if (!name) return { error: '請填寫名稱。', field: 'name' };
    if (name.length > LIMITS.name) return { error: '名稱請在 80 字內。', field: 'name' };
    if (!rawUrl) return { error: '請填寫網址。', field: 'url' };
    const url = safeUrl(rawUrl);
    if (!url) return { error: '網址格式不正確，請用 http:// 或 https:// 開頭的完整網址。', field: 'url' };
    if (description.length > LIMITS.description) return { error: '說明請在 300 字內。', field: 'description' };
    return { data: { name, url, description } };
  }

  function setupForm(base) {
    if (!base) {
      closed.hidden = false;
      form.hidden = true;
      return;
    }
    closed.hidden = true;
    form.hidden = false;

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      formError.textContent = '';
      formStatus.textContent = '';
      ['name', 'url', 'description'].forEach((f) => form.elements[f].removeAttribute('aria-invalid'));

      const v = validate();
      if (v.error) {
        formError.textContent = v.error;
        form.elements[v.field].setAttribute('aria-invalid', 'true');
        form.elements[v.field].focus();
        return;
      }

      // 蜜罐欄位有值：假裝成功，不送出
      if (form.elements.website.value) {
        form.reset();
        formStatus.textContent = '已送出，謝謝！經審核後就會出現在本頁。';
        return;
      }

      sendBtn.disabled = true;
      formStatus.textContent = '送出中…';
      try {
        const res = await fetch(base, {
          method: 'POST',
          // text/plain 不會觸發 CORS 預檢，Apps Script 才收得到
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(Object.assign({ action: 'submit', website: '', client: clientId() }, v.data)),
          credentials: 'omit',
        });
        const out = await res.json().catch(() => null);
        if (!res.ok || !out || !out.ok) {
          const code = out && typeof out.error === 'string' ? out.error : '';
          formStatus.textContent = '';
          formError.textContent = messages[code] || '送出失敗，請稍後再試。';
          return;
        }
        form.reset();
        formStatus.textContent = '已送出，謝謝！經審核後就會出現在本頁。';
      } catch (e) {
        formStatus.textContent = '';
        formError.textContent = '送出失敗，請檢查網路後再試。';
      } finally {
        sendBtn.disabled = false;
      }
    });
  }

  const base = apiBase();
  setupForm(base);
  if (base) loadShared(base);

  /* ---------- 安裝 ---------- */
  // Android Chrome：出現可安裝時才顯示「安裝」按鈕
  const installBtn = document.getElementById('install');
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => null);
    deferred = null;
    installBtn.hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    installBtn.hidden = true;
    say('已加到主畫面。');
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
    });
  }
})();
