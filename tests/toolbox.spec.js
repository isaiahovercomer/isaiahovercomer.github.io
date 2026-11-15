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
const groups = [...hub.categories.map((g) => ({ ...g, items: g.items.filter((i) => i.id !== 'toolbox') })),
  { title: '社群連結', items: hub.social },
  { title: '網站資訊', items: Object.values(hub.footer) }];
const tools = groups.flatMap((g) => g.items);
const resolved = (url, page) => new URL(url, new URL('../', page.url())).href;

async function expectBuiltins(page) {
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
  await expect(page.locator('#builtin img, a[href^="mailto:"]')).toHaveCount(0);
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

test.describe('台中全時間百寶箱', () => {
  test('loads, links, manifest, icons, service worker, screenshots', async ({ page, context }, testInfo) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const external = [];
    page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1')) external.push(r.url()); });

    const resp = await page.goto('/toolbox/', { waitUntil: 'networkidle' });
    expect(resp && resp.ok()).toBeTruthy();
    await expect(page).toHaveTitle('台中全時間百寶箱');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('台中全時間百寶箱');

    const cards = await expectBuiltins(page);
    for (let i = 0; i < 3; i++) {
      const openBox = await cards.nth(i).locator('a.btn-open').boundingBox();
      expect(openBox.height).toBeGreaterThanOrEqual(56);
    }

    // 未設定 API_URL：不發後端請求，新增連結暫未開放
    await expect(page.locator('#submit-closed')).toBeVisible();
    await expect(page.locator('#submit-closed')).toHaveText('新增連結暫未開放。');
    await expect(page.locator('#submit-form')).toBeHidden();
    await expect(page.locator('#shared')).toBeHidden();
    expect(external).toEqual([]);

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
    expect(manifest.name).toBe('台中全時間百寶箱');
    expect(manifest.short_name).toBe('全時間百寶箱');
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
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', '全時間百寶箱');

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
    updated.categories[0].items.push({ title: '新增測試工具', description: '共用資料自動更新', url: 'new-tool/' });
    updated.categories[0].items.push({ title: '自身別名', url: 'toolbox/index.html' });
    await page.route('**/links.json', (route) => json(route, updated));
    await page.goto('/toolbox/');
    const card = page.locator('#builtin li').filter({ hasText: '新增測試工具' });
    await expect(card.locator('h3')).toHaveText('新增測試工具');
    await expect(card.locator('.tool-desc')).toHaveText('共用資料自動更新');
    await expect(card.locator('a')).toHaveAttribute('href', new URL('/new-tool/', page.url()).href);
    await expect(page.locator('#builtin')).not.toContainText('自身別名');
  });

  test('homepage data failure is explained while the submission area remains available', async ({ page }) => {
    await page.route('**/links.json', (route) => route.abort());
    await page.goto('/toolbox/');
    await expect(page.locator('#builtin-status')).toContainText('目前無法讀取全部連結');
    await expect(page.locator('#submit-closed')).toBeVisible();
  });

  test('source files have no cross glyphs or emoji', async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'file scan once');
    for (const f of ['index.html', 'style.css', 'app.js', 'config.js', 'sw.js', 'manifest.webmanifest',
      'img/app-icon.svg', 'img/signup.svg', 'img/link-card.svg', 'img/love-letter.svg']) {
      const text = fs.readFileSync(path.join(boxDir, f), 'utf8');
      expect(forbidden.test(text), f).toBeFalsy();
      expect(emoji.test(text), f).toBeFalsy();
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
      await expect(shared).toHaveCount(2);
      await expect(shared.nth(0).locator('h2')).toHaveText('<img src=x onerror="window.__xss=1">台中召會');
      await expect(shared.nth(0).locator('.tool-desc')).toHaveText('<script>window.__xss=1</script>說明文字');
      await expect(shared.nth(0).locator('a.btn-open')).toHaveAttribute('href', 'https://example.org/a?b=1&c=2');
      await expect(shared.nth(0).locator('button.btn-copy')).toHaveAttribute('data-url', 'https://example.org/a?b=1&c=2');
      await expect(shared.nth(1).locator('a.btn-open')).toHaveAttribute('href', 'http://example.com/');
      await expect(page.locator('#shared img, #shared script')).toHaveCount(0);
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
    await expect(card).toContainText('台中全時間百寶箱');
    await card.click();
    await expect(page).toHaveURL(/\/toolbox\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('台中全時間百寶箱');
  });
});
