const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const shotsDir = process.env.SHOTS_DIR || '/workspace/link-hub/shots';
const boxDir = path.join(__dirname, '..', 'toolbox');
// Code points only — do not put these glyphs in page copy or icons.（與 line.spec.js 相同）
const forbidden = /[✝✞✟†☦✠⛪☧☨☩]/u;
const emoji = /\p{Extended_Pictographic}/u;
const FAKE_API = 'https://toolbox-api.example/exec';

const hub = require('../links.json');
const categoryOrder = ['bible', 'church', 'line-cards', 'tools', 'music', 'family', 'social', 'info'];
const itemOrder = {
  social: ['youtube', 'soundcloud', 'blog', 'facebook', 'instagram'],
  info: ['privacy', 'terms'],
  bible: ['morning-revival-today-site', 'interlinear-bible'],
  church: ['forms-app-web', 'taichung-church-reports-site', '2026-tcchlife-pyramid', '2026-twyp-chlife'],
  'line-cards': ['line-tools', 'line-signup', 'line-link-card', 'line-love-letter', 'line-prayer-wall', 'line-outreach', 'fulltime-weekly-report'],
  tools: ['pdb-workbench'],
  music: ['isaiahs-garden', 'numbered-score-studio'],
  family: ['family-story-365', 'gospel-tracts-animation', 'curd-honey-bible-journey'],
};
const rank = (order, id) => order.includes(id) ? order.indexOf(id) : order.length;
const extraTools = [
  {
    categoryId: 'church',
    id: 'taichung-church-reports-site',
    title: '行動報導平台',
    description: '建立與瀏覽台中市召會的行動報導。',
    url: 'https://isaiahovercomer.github.io/taichung-church-reports-site/',
  },
];
const groups = [...hub.categories.map((g) => ({ ...g, items: g.items.filter((i) => i.id !== 'toolbox') })),
  { id: 'social', title: '社群連結', items: hub.social },
  { id: 'info', title: '網站資訊', items: Object.entries(hub.footer).map(([id, item]) => ({ ...item, id })) }];
for (const extra of extraTools) {
  const group = groups.find((g) => g.id === extra.categoryId);
  if (!group || group.items.some((item) => item.id === extra.id)) continue;
  group.items.push({
    id: extra.id,
    title: extra.title,
    description: extra.description,
    url: extra.url,
  });
}
groups.sort((a, b) => rank(categoryOrder, a.id) - rank(categoryOrder, b.id));
for (const group of groups) {
  const order = itemOrder[group.id] || [];
  group.items = [...group.items].sort((a, b) => rank(order, a.id) - rank(order, b.id));
}
const excludedGroups = groups.filter(g => ['social', 'info'].includes(g.id));
const excludedTools = [...excludedGroups.flatMap(g => g.items), ...groups.flatMap(g => g.items).filter(i => ['isaiahs-garden', 'ai-quota-dashboard'].includes(i.id))];
groups.splice(0, groups.length, ...groups.filter(g => !['social', 'info'].includes(g.id)));
for (const group of groups) group.items = group.items.filter(i => !['isaiahs-garden', 'ai-quota-dashboard'].includes(i.id));
const tools = groups.flatMap((g) => g.items);
const resolved = (url, page) => new URL(url, new URL('../', page.url())).href;

async function expectBuiltins(page) {
  for (const group of excludedGroups) await expect(page.locator('#builtin .category > h2')).not.toContainText([group.title]);
  for (const item of excludedTools) {
    await expect(page.locator('#builtin h3').filter({ hasText: item.title })).toHaveCount(0);
    expect(await page.locator('#builtin a.btn-open').evaluateAll(as => as.map(a => a.href))).not.toContain(resolved(item.url, page));
  }
  const cards = page.locator('#builtin li.tool');
  await expect(cards).toHaveCount(tools.length);
  await expect(page.locator('#builtin .category > h2')).toHaveText(groups.map((g) => g.title));
  for (const [i, t] of tools.entries()) {
    const card = cards.nth(i);
    await expect(card.locator('h3')).toHaveText(t.title);
    await expect(card.locator('.tool-desc')).toHaveText(t.description || '');
    await expect(card.locator('a.btn-open')).toHaveAttribute('href', resolved(t.url, page));
    await expect(card.locator('button.btn-copy')).toHaveAttribute('data-url', resolved(t.url, page));
  }
  await expect(page.locator('#builtin a[href$="/toolbox/"]')).toHaveCount(0);
  await expect(page.locator('#builtin a[href^="mailto:"]')).toHaveCount(0);
  const iconMap = JSON.parse(fs.readFileSync(path.join(boxDir, 'icons', 'map.json'), 'utf8'));
  for (const [i, t] of tools.entries()) {
    const card = cards.nth(i);
    const marks = card.locator('.tool-head img, .tool-head .tool-letter');
    await expect(marks).toHaveCount(1);
    const file = iconMap.byId[t.id];
    if (file) {
      await expect(card.locator('.tool-head img')).toHaveAttribute('src', new RegExp(`(?:^|/)icons/${file.replace(/[.]/g, '\\.')}$`));
      await expect(card.locator('.tool-head img')).toHaveAttribute('alt', '');
    } else {
      await expect(card.locator('.tool-head .tool-letter')).toHaveCount(1);
    }
  }
  return cards;
}

// 以假的後端網址取代 config.js，並攔截所有對它的請求
async function useFakeApi(page, handler) {
  await page.route('**/toolbox/config.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `window.TOOLBOX_CONFIG = { API_URL: '${FAKE_API}' };`,
  }));
  const calls = [];
  await page.route('https://toolbox-api.example/**', async (route) => {
    const req = route.request();
    calls.push({ method: req.method(), url: req.url(), body: req.postData() });
    await handler(route, req);
  });
  return calls;
}

function json(route, obj) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(obj),
  });
}

test.describe('台中全時間服事百寶箱', () => {
  test.beforeEach(async ({ page }) => {
    // 預設攔截 config 與假 API；個別案例可覆寫 mock。
    await useFakeApi(page, (route) => json(route, { ok: true, items: [] }));
  });
  // Keep service-worker fetches from bypassing config/API routes on subsequent loads.
  test.describe('computed contrast', () => {
    test.use({ serviceWorkers: 'block' });
    // Catch unreadable text, including translucent backgrounds and control states.
    test('all visible text has computed contrast of at least 4.5:1', async ({ page }, testInfo) => {
      await useFakeApi(page, (route, req) => json(route, req.method() === 'POST'
        ? { ok: true } : { ok: true, items: [{ name: '推薦工具', description: '已審核說明', url: 'https://example.org/' }] }));
      await page.goto('/toolbox/', { waitUntil: 'networkidle' });
      await expect(page.locator('#builtin .category')).toHaveCount(groups.length);
      const results = [];
      async function check(state) {
        const rows = await page.evaluate(() => {
          const rgba = (s) => s.match(/[\d.]+/g).map(Number);
          const over = (fg, bg) => {
            const a = fg[3] ?? 1;
            return fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a));
          };
          function background(el) {
            if (!el) return [255, 255, 255];
            const style = getComputedStyle(el);
            // Nonuniform backgrounds need pixel sampling; fail instead of silently ignoring them.
            if (style.backgroundImage !== 'none') throw new Error('Unsupported background image: ' + el.tagName);
            return over(rgba(style.backgroundColor), background(el.parentElement));
          }
          const lum = (rgb) => rgb.map(v => {
            v /= 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
          const rows = [];
          for (const el of document.body.querySelectorAll('*')) {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || !rect.width || !rect.height || rect.right <= 0 || rect.left >= innerWidth) continue;
            const texts = [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()).map(n => n.textContent.trim());
            if (el.matches('input, textarea') && el.value) texts.push(el.value);
            const variants = texts.map(text => ({ text, color: style.color, opacity: 1 }));
            if (el.matches('input, textarea') && !el.value && el.placeholder) {
              const placeholder = getComputedStyle(el, '::placeholder');
              variants.push({ text: el.placeholder, color: placeholder.color, opacity: Number(placeholder.opacity) });
            }
            for (const item of variants) {
              let fg = rgba(item.color);
              fg[3] = (fg[3] ?? 1) * item.opacity;
              let bg = background(el);
              fg = over(fg, bg);
              // Group opacity composites both text and its background onto the parent.
              for (let node = el; node; node = node.parentElement) {
                const computed = getComputedStyle(node);
                if (computed.filter !== 'none') {
                  const match = computed.filter.match(/^brightness\(([\d.]+)(%)?\)$/);
                  if (!match) throw new Error('Unsupported filter: ' + computed.filter);
                  const brightness = Number(match[1]) / (match[2] ? 100 : 1);
                  fg = fg.map(v => Math.min(255, v * brightness));
                  bg = bg.map(v => Math.min(255, v * brightness));
                }
                const opacity = Number(computed.opacity);
                if (opacity < 1) {
                  const under = background(node.parentElement);
                  fg = over([...fg, opacity], under);
                  bg = over([...bg, opacity], under);
                }
              }
              const a = lum(fg), b = lum(bg);
              rows.push({ text: item.text, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) });
            }
          }
          return rows;
        });
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) expect(row.ratio, `${state}: ${row.text}`).toBeGreaterThanOrEqual(4.5);
        results.push(...rows);
      }
      await check('default');
      for (const el of await page.locator('button:visible, a:visible, input:visible:not(#f-website), textarea:visible').all()) {
        await page.keyboard.press('Tab');
        await el.focus();
        await check('focus');
        await el.hover();
        await check('hover');
        await page.mouse.down();
        await page.waitForTimeout(180); // .btn's 150ms brightness transition must settle.
        await check('active');
        await page.mouse.move(0, 0);
        await page.mouse.up();
      }
      await page.locator('#builtin .btn-copy').first().click();
      await check('copy feedback');
      await page.locator('.category-toggle').first().click();
      await check('collapsed category');
      await page.locator('.category-toggle').first().click();
      await page.locator('#send').click();
      await check('validation error');
      await page.locator('#f-name').fill('測試名稱');
      await page.locator('#f-url').fill('https://example.org/');
      await page.locator('#f-desc').fill('測試說明');
      await check('filled inputs');
      // Keep the mocked POST pending to inspect the real disabled sending state.
      let release;
      const pending = new Promise(resolve => { release = resolve; });
      await page.route('https://toolbox-api.example/**', async route => {
        await pending;
        await json(route, { ok: true });
      });
      await page.locator('#send').click();
      await expect(page.locator('#send')).toBeDisabled();
      await check('sending');
      release();
      await expect(page.locator('#form-status')).toContainText('已送出');
      await check('success');
      await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true })));
      await check('install button');
      await page.route('**/toolbox/config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.TOOLBOX_CONFIG = {};' }));
      await page.route('**/links.json', route => route.abort());
      await page.goto('/toolbox/', { waitUntil: 'networkidle' });
      await expect(page.locator('#submit-closed')).toBeVisible();
      await expect(page.locator('#builtin-status')).toContainText('目前無法讀取');
      await check('closed form and loading failure');
      const minimum = Math.min(...results.map(r => r.ratio));
      console.log(`CONTRAST ${testInfo.project.name}: minimum=${minimum.toFixed(6)}, samples=${results.length}`);
    });

  });

  test('category palettes and card shades apply automatically', async ({ page }) => {
    await page.goto('/toolbox/', { waitUntil: 'networkidle' });
    const colors = await page.locator('#builtin .category').evaluateAll(sections => sections.map(section =>
      [...section.querySelectorAll('.tool')].map(card => getComputedStyle(card).backgroundColor)));
    expect(new Set(colors.map(group => group[0])).size).toBe(colors.length);
    for (const group of colors) expect(new Set(group).size).toBe(group.length);
  });

  test('categories expand by default and toggle accessibly without affecting submission', async ({ page }) => {
    await page.goto('/toolbox/', { waitUntil: 'networkidle' });
    const categories = page.locator('#builtin .category');
    await expect(categories).toHaveCount(groups.length);
    await page.locator('#f-name').fill('保留表單內容');
    for (const category of await categories.all()) {
      const toggle = category.locator('h2').getByRole('button');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const list = category.locator('ol');
      await expect(list).toBeVisible();
      const bounds = await toggle.boundingBox();
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      await expect(toggle).toHaveAttribute('aria-controls', await list.getAttribute('id'));
      await toggle.click();
      await expect(category.locator('h2').getByRole('button')).toHaveAttribute('aria-expanded', 'false');
      await expect(list).toBeHidden();
      await expect(page.locator('#submit-form')).toBeVisible();
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(list).toBeVisible();
    }
    const first = categories.first().locator('h2').getByRole('button');
    await first.focus();
    await expect(first).toBeFocused();
    expect(await first.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
    await page.keyboard.press('Enter');
    await expect(first).toHaveAttribute('aria-expanded', 'false');
    await expect(categories.first().locator('ol')).toBeHidden();
    await page.keyboard.press('Space');
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    await expect(categories.first().locator('ol')).toBeVisible();
    for (const category of await categories.all()) await category.locator('h2').getByRole('button').click();
    await expect(page.locator('#builtin ol:visible')).toHaveCount(0);
    await expect(page.locator('#submit-form')).toBeVisible();
    await expect(page.locator('#f-name')).toHaveValue('保留表單內容');
    await page.locator('#send').click();
    await expect(page.locator('#form-error')).toHaveText('請填寫網址。');
  });

  test('all homepage links except exclusions appear, exclusions stay absent, manifest, icons, service worker, screenshots', async ({ page, context }, testInfo) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const external = [];
    page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1')) external.push(r.url()); });

    const resp = await page.goto('/toolbox/', { waitUntil: 'networkidle' });
    expect(resp && resp.ok()).toBeTruthy();
    await expect(page).toHaveTitle('台中全時間服事百寶箱');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('台中全時間服事百寶箱');

    const cards = await expectBuiltins(page);
    for (let i = 0; i < 3; i++) {
      const openBox = await cards.nth(i).locator('a.btn-open').boundingBox();
      expect(openBox.height).toBeGreaterThanOrEqual(56);
    }

    // API 已開放，推薦清單與投稿皆由 route mock 隔離
    await expect(page.locator('#submit-closed')).toBeHidden();
    await expect(page.locator('#submit-form')).toBeVisible();
    await expect(page.locator('#shared')).toBeHidden();
    expect(external.every((url) => url.startsWith(FAKE_API))).toBeTruthy();

    // copy button
    await cards.nth(1).locator('button.btn-copy').click();
    await expect(page.locator('#status')).toContainText('已複製');
    if (testInfo.project.name === 'desktop') {
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(tools[1].url);
    }

    // layout: stacked on phone, three columns on desktop, no sideways scroll
    const a = await cards.nth(0).boundingBox();
    const b = await cards.nth(1).boundingBox();
    if (testInfo.project.name === 'desktop') {
      expect(b.x).toBeGreaterThan(a.x + 200);
      expect(Math.abs(b.y - a.y)).toBeLessThan(5);
    } else {
      expect(b.y).toBeGreaterThan(a.y + 100);
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(390);
    }

    // order: built-ins, install help, then the submit section at the very bottom
    const order = await page.evaluate(() => ['#builtin', '.install', '#submit']
      .map((s) => document.querySelector(s).getBoundingClientRect().top + window.scrollY));
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);

    // manifest parses and points at existing icons
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifestUrl = new URL(manifestHref, page.url()).href;
    expect(new URL(manifestUrl).pathname).toBe('/toolbox/manifest.webmanifest');
    const mres = await page.request.get(manifestUrl);
    expect(mres.ok()).toBeTruthy();
    const manifest = JSON.parse(await mres.text());
    expect(manifest.name).toBe('台中全時間服事百寶箱');
    expect(manifest.short_name).toBe('服事百寶箱');
    expect(manifest.start_url).toBe('/toolbox/');
    expect(manifest.scope).toBe('/toolbox/');
    expect(manifest.display).toBe('standalone');
    const sizes = manifest.icons.map((i) => `${i.sizes}/${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192/any', '512x512/any', '512x512/maskable']));
    for (const icon of manifest.icons) {
      const r = await page.request.get(new URL(icon.src, manifestUrl).href);
      expect(r.ok(), icon.src).toBeTruthy();
    }

    // iOS
    const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    expect((await page.request.get(new URL(apple, page.url()).href)).ok()).toBeTruthy();
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', '服事百寶箱');

    // icon files on disk (+ hub card icon)
    for (const f of ['signup.svg', 'link-card.svg', 'love-letter.svg', 'app-icon.svg',
      'icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png']) {
      expect(fs.existsSync(path.join(boxDir, 'img', f)), f).toBeTruthy();
    }
    expect(fs.existsSync(path.join(__dirname, '..', 'img', 'sites', 'toolbox.png'))).toBeTruthy();

    // own service worker, scoped to /toolbox/
    const swRes = await page.request.get(new URL('sw.js', page.url()).href);
    expect(swRes.ok()).toBeTruthy();
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(new URL(scope).pathname).toBe('/toolbox/');

    // install instructions
    await expect(page.getByRole('heading', { name: '加到手機主畫面' })).toBeVisible();
    await expect(page.locator('.install')).toContainText('加入主畫面');
    await expect(page.locator('.install')).toContainText('安裝');
    await expect(page.locator('.install')).toContainText('LINE');

    // no cross glyphs or emoji on the page
    expect(forbidden.test(await page.content())).toBeFalsy();
    expect(emoji.test(await page.locator('body').innerText())).toBeFalsy();

    fs.mkdirSync(shotsDir, { recursive: true });
    const name = testInfo.project.name === 'desktop' ? 'toolbox-desktop.png' : 'toolbox-390.png';
    await page.locator('#status').evaluate((el) => { el.textContent = ''; });
    await expect(cards.nth(1).locator('button.btn-copy')).toHaveText('複製網址', { timeout: 5000 });
    await page.screenshot({ path: path.join(shotsDir, name), fullPage: true });
  });

  test('new homepage links follow automatically and resolve from the root', async ({ page }) => {
    const updated = structuredClone(hub);
    updated.categories.reverse();
    for (const group of updated.categories) group.items.reverse();
    const bible = updated.categories.find((g) => g.id === 'bible');
    bible.items.unshift({ title: '新增測試工具', description: '共用資料自動更新', url: 'new-tool/' });
    bible.items.push({ title: '自身別名', url: 'toolbox/index.html' });
    updated.categories.unshift({ id: 'future', title: '新分類', items: [{ title: '未來工具', url: 'future/' }] });
    await page.route('**/links.json', (route) => json(route, updated));
    await page.goto('/toolbox/');
    const card = page.locator('#builtin li').filter({ hasText: '新增測試工具' });
    await expect(card.locator('h3')).toHaveText('新增測試工具');
    await expect(card.locator('.tool-desc')).toHaveText('共用資料自動更新');
    await expect(card.locator('.tool-letter')).toHaveText('新');
    await expect(card.locator('.tool-head img')).toHaveCount(0);
    await expect(card.locator('a')).toHaveAttribute('href', new URL('/new-tool/', page.url()).href);
    await expect(page.locator('#builtin')).not.toContainText('自身別名');
    const addedColor = await card.evaluate(el => getComputedStyle(el).backgroundColor);
    const firstColor = await page.locator('#builtin .tool').first().evaluate(el => getComputedStyle(el).backgroundColor);
    expect(addedColor).not.toBe(firstColor);
    const futureCard = page.locator('#builtin .category').last().locator('.tool');
    const futureColor = await futureCard.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(futureColor).not.toBe(firstColor);
    await expect(futureCard.locator('.tool-letter')).toHaveText('未');
    await expect(page.locator('#builtin .category > h2')).toHaveText([...groups.map((g) => g.title), '新分類']);
    await expect(page.locator('#builtin .category').first().locator('h3')).toHaveText([...groups[0].items.map((i) => i.title), '新增測試工具']);
  });

  test('homepage data failure is explained while the submission area remains available', async ({ page }) => {
    await page.route('**/links.json', (route) => route.abort());
    await page.goto('/toolbox/');
    await expect(page.locator('#builtin-status')).toContainText('目前無法讀取全部連結');
    await expect(page.locator('#submit-closed')).toBeHidden();
  });

  test('source files have no cross glyphs or emoji', async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'file scan once');
    for (const f of ['index.html', 'style.css', 'app.js', 'config.js', 'sw.js', 'manifest.webmanifest',
      'img/app-icon.svg', 'img/signup.svg', 'img/link-card.svg', 'img/love-letter.svg', 'icons/map.json']) {
      const text = fs.readFileSync(path.join(boxDir, f), 'utf8');
      expect(forbidden.test(text), f).toBeFalsy();
      expect(emoji.test(text), f).toBeFalsy();
    }
    const sw = fs.readFileSync(path.join(boxDir, 'sw.js'), 'utf8');
    expect(sw).toMatch(/const CACHE = 'toolbox-v6'/);
    const iconMap = JSON.parse(fs.readFileSync(path.join(boxDir, 'icons', 'map.json'), 'utf8'));
    expect(sw).toContain('icons/map.json');
    for (const file of Object.values(iconMap.byId)) {
      expect(sw).toContain('icons/' + file);
      expect(fs.existsSync(path.join(boxDir, 'icons', file)), file).toBeTruthy();
    }
    // config.js 只放公開網址，不放密碼或金鑰
    const cfg = fs.readFileSync(path.join(boxDir, 'config.js'), 'utf8');
    expect(cfg).not.toMatch(/password|secret|token|api[_-]?key|SHEET_ID/i);
  });

  test.describe('with a mocked backend', () => {
    // service worker 會攔截請求，Playwright 的 route 就看不到；這組測試不註冊 SW
    test.use({ serviceWorkers: 'block' });

    test('approved links render safely after the built-ins', async ({ page }) => {
      await useFakeApi(page, (route, req) => {
        expect(new URL(req.url()).searchParams.get('action')).toBe('list');
        return json(route, {
          ok: true,
          items: [
            { name: '<img src=x onerror="window.__xss=1">台中召會', url: 'https://example.org/a?b=1&c=2',
              description: '<script>window.__xss=1</script>說明文字' },
            { name: '原文對照聖經', url: 'https://isaiahovercomer.github.io/interlinear-bible/', description: '已審核' },
            { name: '壞連結', url: 'javascript:window.__xss=1', description: '不應顯示' },
            { name: '資料網址', url: 'data:text/html,<script>window.__xss=1</script>', description: '不應顯示' },
            { name: '沒有協定', url: 'example.org', description: '不應顯示' },
            { name: '第二個好連結', url: 'http://example.com/', description: '' },
          ],
        });
      });
      await page.goto('/toolbox/', { waitUntil: 'networkidle' });
      await expectBuiltins(page);

      const shared = page.locator('#shared-list > li.tool');
      await expect(page.locator('#shared')).toBeVisible();
      await expect(shared).toHaveCount(3);
      await expect(shared.nth(0).locator('h2')).toHaveText('<img src=x onerror="window.__xss=1">台中召會');
      await expect(shared.nth(0).locator('.tool-desc')).toHaveText('<script>window.__xss=1</script>說明文字');
      await expect(shared.nth(0).locator('a.btn-open')).toHaveAttribute('href', 'https://example.org/a?b=1&c=2');
      await expect(shared.nth(0).locator('button.btn-copy')).toHaveAttribute('data-url', 'https://example.org/a?b=1&c=2');
      await expect(shared.nth(0).locator('.tool-letter')).toHaveCount(1);
      await expect(shared.nth(0).locator('img')).toHaveCount(0);
      await expect(shared.nth(1).locator('h2')).toHaveText('原文對照聖經');
      await expect(shared.nth(1).locator('.tool-head img')).toHaveAttribute('src', /(?:^|\/)icons\/interlinear-bible\.png$/);
      await expect(shared.nth(2).locator('a.btn-open')).toHaveAttribute('href', 'http://example.com/');
      await expect(shared.nth(2).locator('.tool-letter')).toHaveText('第');
      await expect(page.locator('#shared script')).toHaveCount(0);
      const iconSrcs = await page.locator('#shared img').evaluateAll((imgs) => imgs.map((img) => img.getAttribute('src')));
      expect(iconSrcs.length).toBe(1);
      for (const src of iconSrcs) {
        expect(src).toMatch(/(?:^|\/)icons\/[a-zA-Z0-9._-]+\.(png|svg)$/);
        expect(src).not.toMatch(/^(https?:|data:|javascript:)/i);
      }
      expect(await page.evaluate(() => window.__xss)).toBeUndefined();
      const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
      for (const h of hrefs) expect(h).toMatch(/^https?:\/\//);

      // built-ins come first
      const firstShared = await shared.nth(0).boundingBox();
      const lastBuiltin = await page.locator('#builtin li.tool').last().boundingBox();
      expect(firstShared.y).toBeGreaterThan(lastBuiltin.y);

      await expect(page.locator('#submit-form')).toBeVisible();
      await expect(page.locator('#submit-closed')).toBeHidden();
    });

    test('backend failure keeps the built-ins working', async ({ page }) => {
      const calls = await useFakeApi(page, (route) => route.abort('failed'));
      await page.goto('/toolbox/', { waitUntil: 'networkidle' });
      await expectBuiltins(page);
      await expect(page.locator('#list-status')).toContainText('目前無法讀取推薦連結', { timeout: 25000 });
      await expect(page.locator('#shared')).toBeHidden();
      expect(calls.length).toBeGreaterThanOrEqual(1);
      await expect(page.locator('#submit-form')).toBeVisible();
    });

    test('rejects bad URLs, honours the honeypot, submits good data', async ({ page }) => {
      const calls = await useFakeApi(page, (route, req) => {
        if (req.method() === 'POST') return json(route, { ok: true });
        return json(route, { ok: true, items: [] });
      });
      const posts = () => calls.filter((c) => c.method === 'POST');
      await page.goto('/toolbox/', { waitUntil: 'networkidle' });
      await expectBuiltins(page);

      const form = page.locator('#submit-form');
      const err = page.locator('#form-error');
      await expect(form.locator('label[for="f-name"]')).toContainText('必填');
      await expect(form.locator('label[for="f-url"]')).toContainText('必填');
      await expect(form.locator('label[for="f-desc"]')).toContainText('選填');
      await expect(page.locator('#f-website')).not.toBeInViewport();

      // missing name
      await page.locator('#f-url').fill('https://example.org/');
      await page.locator('#send').click();
      await expect(err).toHaveText('請填寫名稱。');

      for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'example.org/path', '  ', 'ftp://example.org/']) {
        await page.locator('#f-name').fill('測試');
        await page.locator('#f-url').fill(bad);
        await page.locator('#send').click();
        await expect(err).toContainText(bad.trim() ? '網址格式不正確' : '請填寫網址');
        await expect(page.locator('#f-url')).toHaveAttribute('aria-invalid', 'true');
      }

      // too long description
      await page.locator('#f-url').fill('https://example.org/');
      await page.locator('#f-desc').evaluate((el) => { el.removeAttribute('maxlength'); el.value = 'x'.repeat(301); });
      await page.locator('#send').click();
      await expect(err).toHaveText('說明請在 300 字內。');
      expect(posts()).toHaveLength(0);

      // honeypot: pretend success, send nothing
      await page.locator('#f-desc').fill('');
      await page.locator('#f-website').evaluate((el) => { el.value = 'spam'; });
      await page.locator('#send').click();
      await expect(page.locator('#form-status')).toContainText('已送出');
      expect(posts()).toHaveLength(0);

      // good submission
      await page.locator('#f-name').fill('  台中召會網站  ');
      await page.locator('#f-url').fill(' https://example.org/tc ');
      await page.locator('#f-desc').fill('聚會時間與地點');
      await page.locator('#send').click();
      await expect(page.locator('#form-status')).toContainText('已送出');
      await expect(err).toBeEmpty();
      expect(posts()).toHaveLength(1);
      const body = JSON.parse(posts()[0].body);
      expect(body).toMatchObject({
        action: 'submit', name: '台中召會網站', url: 'https://example.org/tc', description: '聚會時間與地點', website: '',
      });
      await expect(page.locator('#f-name')).toHaveValue('');
    });

    test('shows backend errors in the page, not an alert', async ({ page }) => {
      let dialogs = 0;
      page.on('dialog', (d) => { dialogs += 1; d.dismiss(); });
      await useFakeApi(page, (route, req) => {
        if (req.method() === 'POST') return json(route, { ok: false, error: 'rate_limited' });
        return json(route, { ok: true, items: [] });
      });
      await page.goto('/toolbox/', { waitUntil: 'networkidle' });
      await page.locator('#f-name').fill('測試');
      await page.locator('#f-url').fill('https://example.org/');
      await page.locator('#send').click();
      await expect(page.locator('#form-error')).toHaveText('送出次數太多，請過一小時再試。');
      expect(dialogs).toBe(0);
    });
  });

  test('hub links to the page', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const card = page.locator('a.card[href="toolbox/"]');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('台中全時間服事百寶箱');
    await card.click();
    await expect(page).toHaveURL(/\/toolbox\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('台中全時間服事百寶箱');
  });
});
