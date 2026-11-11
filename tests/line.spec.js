const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const shotsDir = process.env.SHOTS_DIR || '/workspace/link-hub/shots';
const lineDir = path.join(__dirname, '..', 'line');
// Code points only — do not put these glyphs in page copy or icons.
const forbidden = /[✝✞✟†☦✠⛪☧☨☩]/u;
const emoji = /\p{Extended_Pictographic}/u;

const tools = [
  { title: 'LINE簡易活動登記建立平台', url: 'https://liff.line.me/2012412693-a7phfbWa',
    desc: '群組內登記活動、愛筵帶菜、帶人接龍累計。年長聖徒可以一鍵登記。' },
  { title: 'LINE網頁圖卡分享建立平台', url: 'https://liff.line.me/2012412693-IKxGZtWK',
    desc: '增加分享單一網址的顯眼可讀性，同時可在裡面填上行動資訊，自動產生邀請卡。' },
  { title: 'LINE流通愛圖卡建立平台', url: 'https://liff.line.me/2012412693-IhnpCNtr',
    desc: '推動題名代禱後下一步在LINE上寫封問候信關心小羊福友，聖徒們也可以彼此牧養。' },
];

test.describe('LINE 功能整理頁', () => {
  test('loads, links, manifest, icons, screenshots', async ({ page, context }, testInfo) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const resp = await page.goto('/line/', { waitUntil: 'networkidle' });
    expect(resp && resp.ok()).toBeTruthy();
    await expect(page).toHaveTitle('召會生活實行常用LINE功能整理');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('召會生活實行常用LINE功能整理');

    // three cards, in order, with exact links and copy
    const cards = page.locator('li.tool');
    await expect(cards).toHaveCount(3);
    for (const [i, t] of tools.entries()) {
      const card = cards.nth(i);
      await expect(card.locator('h2')).toHaveText(`${i + 1}${t.title}`);
      await expect(card.locator('.tool-desc')).toHaveText(t.desc);
      await expect(card.locator('a.btn-open')).toHaveAttribute('href', t.url);
      await expect(card.locator('a.btn-open')).toHaveText('打開');
      await expect(card.locator('button.btn-copy')).toHaveAttribute('data-url', t.url);
      const img = card.locator('.tool-head img');
      await expect.poll(() => img.evaluate((el) => el.complete && el.naturalWidth > 0)).toBeTruthy();
      const openBox = await card.locator('a.btn-open').boundingBox();
      expect(openBox.height).toBeGreaterThanOrEqual(56);
    }
    const liff = await page.$$eval('a[href^="https://liff.line.me/"]', (as) => as.map((a) => a.href));
    expect(liff).toEqual(tools.map((t) => t.url));

    // copy button
    await cards.nth(1).locator('button.btn-copy').click();
    await expect(page.locator('#status')).toContainText('已複製');
    if (testInfo.project.name === 'desktop') {
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(tools[1].url);
    }

    // layout: stacked on phone, three columns on desktop
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

    // manifest parses and points at existing icons
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifestUrl = new URL(manifestHref, page.url()).href;
    const mres = await page.request.get(manifestUrl);
    expect(mres.ok()).toBeTruthy();
    const manifest = JSON.parse(await mres.text());
    expect(manifest.name).toBe('召會生活實行常用LINE功能整理');
    expect(manifest.short_name).toBe('LINE功能整理');
    expect(manifest.start_url).toBe('/line/');
    expect(manifest.scope).toBe('/line/');
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
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'LINE功能整理');

    // icon files on disk
    for (const f of ['signup.svg', 'link-card.svg', 'love-letter.svg', 'app-icon.svg',
      'icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png']) {
      expect(fs.existsSync(path.join(lineDir, 'img', f)), f).toBeTruthy();
    }

    // service worker controls the page
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(new URL(scope).pathname).toBe('/line/');

    // install instructions
    await expect(page.getByRole('heading', { name: '加到手機主畫面' })).toBeVisible();
    await expect(page.locator('.install')).toContainText('加入主畫面');
    await expect(page.locator('.install')).toContainText('安裝');

    // no cross glyphs or emoji anywhere on the page or in its text files
    const html = await page.content();
    expect(forbidden.test(html)).toBeFalsy();
    expect(emoji.test(await page.locator('body').innerText())).toBeFalsy();
    for (const f of ['index.html', 'style.css', 'app.js', 'sw.js', 'manifest.webmanifest',
      'img/app-icon.svg', 'img/signup.svg', 'img/link-card.svg', 'img/love-letter.svg']) {
      const text = fs.readFileSync(path.join(lineDir, f), 'utf8');
      expect(forbidden.test(text), f).toBeFalsy();
      expect(emoji.test(text), f).toBeFalsy();
    }

    fs.mkdirSync(shotsDir, { recursive: true });
    const name = testInfo.project.name === 'desktop' ? 'line-tools-desktop.png' : 'line-tools-390.png';
    await page.locator('#status').evaluate((el) => { el.textContent = ''; });
    await expect(cards.nth(1).locator('button.btn-copy')).toHaveText('複製網址', { timeout: 5000 });
    await page.screenshot({ path: path.join(shotsDir, name), fullPage: true });
  });

  test('hub links to the page', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const card = page.locator('a.card[href="line/"]');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('LINE功能整理');
    await card.click();
    await expect(page).toHaveURL(/\/line\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('召會生活實行常用LINE功能整理');
  });
});
