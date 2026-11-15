// 以 Playwright Chromium 把 toolbox/img/app-icon.svg 轉成各尺寸 PNG（本機沒有 rsvg-convert／ImageMagick）。
// 用法（在 repo 根目錄）：node scripts/render-toolbox-icons.js
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'toolbox/img/app-icon.svg'), 'utf8');
const b64 = Buffer.from(svg).toString('base64');
const jobs = [
  ['toolbox/img/icon-192.png', 192, 1],
  ['toolbox/img/icon-512.png', 512, 1],
  ['toolbox/img/maskable-512.png', 512, 0.78],
  ['toolbox/img/apple-touch-icon.png', 180, 1],
  ['toolbox/img/favicon-32.png', 32, 1],
  ['img/sites/toolbox.png', 192, 1],
];
const fsChrome = [
  process.env.PLAYWRIGHT_CHROME,
  '/home/box/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  '/home/box/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
].find((c) => c && fs.existsSync(c));
const chrome = fsChrome;

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(chrome) ? chrome : undefined });
  const page = await browser.newPage();
  for (const [out, size, scale] of jobs) {
    await page.setViewportSize({ width: size, height: size });
    const inner = Math.round(size * scale);
    const off = Math.round((size - inner) / 2);
    await page.setContent(`<html><body style="margin:0;background:#F6F1E7">
      <img src="data:image/svg+xml;base64,${b64}" style="position:absolute;left:${off}px;top:${off}px;width:${inner}px;height:${inner}px"></body></html>`);
    await page.waitForFunction(() => document.querySelector('img').complete);
    await page.screenshot({ path: path.join(root, out), omitBackground: false });
    console.log('wrote', out);
  }
  await browser.close();
})();
