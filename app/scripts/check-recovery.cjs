const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.argv[2] || 'http://127.0.0.1:5184';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/missing-page`);
      await page.waitForSelector('.logo-transition', { state: 'detached' });
      assert.equal(await page.locator('h1').innerText(), 'الصفحة غير موجودة');
      await page.locator('.language-switch').click();
      assert.equal(await page.locator('h1').innerText(), 'Page not found');
      await page.reload();
      await page.waitForSelector('.logo-transition', { state: 'detached' });
      assert.equal(await page.locator('h1').innerText(), 'Page not found');
      await page.locator('.recovery-actions a[href="/"]').click();
      await page.waitForSelector('.logo-transition', { state: 'detached' });
      assert.equal(await page.locator('.explore-link').innerText(), 'Start Journey');
      let failing = true;
      await page.route('**/data/**', route => failing ? route.abort() : route.continue());
      await page.locator('.explore-link').click();
      await page.waitForSelector('.recovery-panel');
      await page.waitForSelector('.logo-transition', { state: 'detached' });
      assert.equal(await page.locator('.recovery-actions button').first().innerText(), 'Try again');
      assert.ok(!(await page.locator('.recovery-panel').innerText()).includes('HTTP'));
      failing = false;
      await page.locator('.recovery-actions button').first().click();
      await page.waitForSelector('.story-toolbar');
      assert.equal(await page.locator('.recovery-panel').count(), 0);
      await page.goto(`${base}/`);
      await page.route('**/images/landing/*.webp', route => route.abort());
      await page.locator('#discover').scrollIntoViewIfNeeded();
      await page.waitForSelector('.landing-preview-fallback');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      console.log(`Recovery, 404, language persistence, hero link, and preview fallback passed at ${width}px`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
