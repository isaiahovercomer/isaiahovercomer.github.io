const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const shotsDir = process.env.SHOTS_DIR || '/workspace/link-hub/shots';
const forbidden = /[✝✝️†☩☦☨✟✞]/u;
// Also catch emoji variation selector combinations if present as literal
const forbiddenNames = ['✝', '✝️', '†', '☩', '☦', '☨', '✟', '✞', '✝️'];

function requestStatus(rawUrl) {
  const url = new URL(rawUrl);
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        method: 'GET',
        hostname: url.hostname,
        path: url.pathname + url.search,
        port: url.port || undefined,
        protocol: url.protocol,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; link-hub-check/1.0)',
          Accept: 'text/html,application/xhtml+xml,application/json,*/*',
        },
        timeout: 20000,
      },
      (res) => {
        // drain
        res.resume();
        resolve({ status: res.statusCode, location: res.headers.location || null });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout ' + rawUrl));
    });
    req.end();
  });
}

test.describe('link hub', () => {
  test('renders categories, search, and screenshots', async ({ page }, testInfo) => {
    const resp = await page.goto('/', { waitUntil: 'networkidle' });
    expect(resp && resp.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/簡晨光 Isaiah 的網頁總覽/);
    await expect(page.getByRole('heading', { name: /簡晨光/ })).toBeVisible();

    const cats = page.locator('details.category');
    await expect(cats).toHaveCount(5);
    for (const el of await cats.all()) {
      await expect(el).toHaveAttribute('open', '');
    }

    // at least 15 content cards (15 items in links.json)
    await expect(page.locator('a.card')).toHaveCount(15);

    const bodyText = await page.locator('body').innerText();
    for (const ch of forbiddenNames) {
      expect(bodyText).not.toContain(ch);
    }
    const html = await page.content();
    expect(forbidden.test(html)).toBeFalsy();

    // no obvious third-party trackers
    expect(html).not.toMatch(/google-analytics|gtag\(|googletagmanager|facebook\.net|hotjar|clarity/i);

    const project = testInfo.project.name;
    fs.mkdirSync(shotsDir, { recursive: true });
    await page.screenshot({
      path: path.join(shotsDir, `${project}-top.png`),
      fullPage: false,
    });
    await page.screenshot({
      path: path.join(shotsDir, `${project}-full.png`),
      fullPage: true,
    });

    // search filter
    await page.locator('#q').fill('晨興');
    await expect(page.locator('a.card:visible')).toHaveCount(1);
    await expect(page.getByRole('link', { name: /中英晨興聖言/ })).toBeVisible();
    await expect(page.locator('details.category:visible')).toHaveCount(1);

    await page.locator('#q').fill('沒有這個關鍵字xyz');
    await expect(page.locator('#empty')).toBeVisible();

    await page.locator('#q').fill('');
    await expect(page.locator('a.card:visible')).toHaveCount(15);

    // collapse one category
    const first = cats.first();
    await first.locator('summary').click();
    await expect(first).not.toHaveAttribute('open', '');
    await first.locator('summary').click();
    await expect(first).toHaveAttribute('open', '');
  });

  test('every listed link returns OK', async ({ page }, testInfo) => {
    // Run the heavy outbound check once (desktop project only)
    test.skip(testInfo.project.name !== 'desktop', 'link check once');
    await page.goto('/', { waitUntil: 'networkidle' });
    const hrefs = await page.$$eval('a[href]', (as) =>
      as.map((a) => a.href).filter((h) => h && !h.startsWith('javascript:'))
    );
    const unique = [...new Set(hrefs)];
    expect(unique.length).toBeGreaterThan(10);

    const results = [];
    for (const href of unique) {
      if (href.startsWith('mailto:')) {
        results.push({ href, status: 'mailto', ok: true });
        continue;
      }
      // Follow a few redirects manually up to 5 hops
      let current = href;
      let status = 0;
      let ok = false;
      let note = '';
      for (let i = 0; i < 5; i++) {
        try {
          const r = await requestStatus(current);
          status = r.status;
          if (status >= 200 && status < 300) {
            ok = true;
            break;
          }
          if ([301, 302, 303, 307, 308].includes(status) && r.location) {
            current = new URL(r.location, current).toString();
            continue;
          }
          // Some social sites send 400/403 to scripted GET but the URL is valid.
          // Retry with a browser context navigation for those hosts.
          note = 'non-2xx ' + status;
          break;
        } catch (e) {
          note = String(e.message || e);
          break;
        }
      }
      if (!ok) {
        const host = new URL(href).hostname;
        if (/(instagram|facebook|youtube|soundcloud)\.com$/.test(host) || host.endsWith('youtube.com') || host.endsWith('instagram.com') || host.endsWith('soundcloud.com')) {
          const br = await page.context().request.get(href, { maxRedirects: 5, timeout: 25000, failOnStatusCode: false });
          status = br.status();
          ok = status >= 200 && status < 400;
          note = ok ? `browser-request ${status}` : `browser-request failed ${status}`;
        }
      }
      results.push({ href, status, ok, note });
    }

    const out = path.join(shotsDir, 'link-check.json');
    fs.mkdirSync(shotsDir, { recursive: true });
    fs.writeFileSync(out, JSON.stringify(results, null, 2));
    const bad = results.filter((r) => !r.ok);
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });
});
