// @ts-check
const path = require('path');

const port = process.env.HUB_PORT || '18765';
const chrome =
  process.env.PLAYWRIGHT_CHROME ||
  '/home/box/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: path.join(__dirname, 'tests'),
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  timeout: 60000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: {
      executablePath: require('fs').existsSync(chrome) ? chrome : undefined,
    },
  },
  projects: [
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
  ],
};
