// Focused checks for the hero, navigation affordance and source card.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'no-preference' });
      await page.goto(process.argv[2] || 'http://127.0.0.1:5173');
      await page.waitForSelector('.logo-transition', { state: 'detached' });
      for (const locale of ['ar', 'en']) {
        if (locale === 'en') {
          await page.locator('.language-switch').click();
          await page.waitForFunction(() => document.documentElement.lang === 'en' && !document.documentElement.dataset.languageSweep);
        }
        const route = await page.locator('.hero-cartography').boundingBox();
        const button = await page.locator('.explore-link').boundingBox();
        const scroll = await page.locator('.landing-scroll').boundingBox();
        assert.ok(route.y >= button.y + button.height, 'Route overlaps hero button');
        assert.ok(route.y + route.height < scroll.y, 'Route overlaps scroll link');
        assert.equal(await page.locator('.hero-cartography ellipse').count(), 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
        await page.locator('.destination-trigger').click();
        await page.waitForSelector('.waypoint-menu');
        await page.keyboard.press('Escape');
        if (locale === 'ar' && width !== 320) await page.screenshot({ path: `qa/landing-polish-hero-${width}.png` });
        await page.locator('.landing-source-example').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => document.querySelector('.landing-source-mark img').getAttribute('src').endsWith('.gif'));
        await page.locator('.landing-source-mark img').evaluate(img => img.decode());
        assert.equal(await page.locator('.landing-source-reference a').getAttribute('href'), 'https://dorar.net/history/event/42');
        if (locale === 'ar' && width !== 320) {
          await page.waitForTimeout(800);
          await page.locator('.landing-source-example').screenshot({ path: `qa/landing-polish-card-${width}.png` });
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        console.log(`PASS ${locale} ${width}px: hero separation, menu, card GIF and source link`);
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.locator('.landing-source-example').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('.landing-source-mark img').getAttribute('src').endsWith('.png'));
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
