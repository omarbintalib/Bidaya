// Visual / browser acceptance checks. Requires Playwright through NODE_PATH.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.argv[2] || 'http://127.0.0.1:5173';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  try {
    for (const locale of ['ar', 'en']) {
      for (const width of [1440, 768, 390, 320]) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(base);
        await page.waitForSelector('.logo-transition', { state: 'detached' });
        if (locale === 'en') await page.locator('.language-switch').click();
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.locator('h1').count(), 1);
        assert.equal(await page.locator('.landing-tour > section').count(), 5);
        await page.locator('.landing-scroll').click();
        assert.equal(await page.evaluate(() => document.activeElement.id), 'discover');
        // Load every deferred image before checking its dimensions or capturing.
        for (const img of await page.locator('.landing-preview').all()) {
          await img.scrollIntoViewIfNeeded();
          await img.evaluate(el => el.decode());
        }
        const layout = await page.evaluate(() => ({
          width: document.documentElement.clientWidth,
          content: document.documentElement.scrollWidth,
          broken: [...document.querySelectorAll('.landing-preview')].filter(i => !i.complete || !i.naturalWidth).map(i => i.src),
        }));
        assert.ok(layout.content <= layout.width + 1, `${locale} ${width}: horizontal overflow ${JSON.stringify(layout)}`);
        assert.deepEqual(layout.broken, []);
        if (width === 1440 || width === 390) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: `qa/landing-${locale}-${width}.png`, fullPage: true });
          if (width === 1440) {
            for (const [name, selector] of [['overview', '.landing-overview'], ['features', '.landing-deeper'], ['sources', '.landing-sources']]) {
              await page.locator(selector).screenshot({ path: `qa/landing-${name}-${locale}.png` });
            }
          }
        }
        // Both real links navigate through the shared transition; browser history returns home.
        for (const selector of ['.landing-overview .landing-begin', '.landing-closing .landing-begin']) {
          await page.locator(selector).click();
          await page.waitForURL('**/journey');
          await page.waitForSelector('.logo-transition', { state: 'detached' });
          await page.goBack();
          await page.waitForSelector('.logo-transition', { state: 'detached' });
          assert.equal(await page.locator('html').getAttribute('lang'), locale);
        }
        console.log(`PASS ${locale} ${width}px: images, scroll link, width, Journey links and history`);
        await page.close();
      }
    }
    // Readability extremes: existing user preferences, both themes, narrow viewport.
    for (const contrast of ['dark', 'light']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      await page.addInitScript(contrast => localStorage.setItem('islamathon.accessibility.v1', JSON.stringify({ contrast, textSize: 150, lineSpacing: 'spacious', characterSpacing: 'spacious', font: 'plex', motion: 'reduced', highlightLinks: true, strongFocus: true })), contrast);
      await page.goto(base);
      await page.waitForSelector('.logo-transition', { state: 'detached' });
      await page.locator('.language-switch').click();
      await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${contrast}: large-text overflow`);
      for (const img of await page.locator('.landing-preview').all()) { await img.scrollIntoViewIfNeeded(); await img.evaluate(el => el.decode()); }
      await page.locator('#discover').evaluate(el => el.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: `qa/landing-${contrast}-large-text.png` });
      console.log(`PASS ${contrast}: enlarged text, spacing, font and contrast`);
      await page.close();
    }
    // Normal motion, keyboard entry, browser Forward, and landscape layout.
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, reducedMotion: 'no-preference' });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.waitForSelector('.logo-transition', { state: 'detached' });
    await page.locator('.landing-scroll').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'discover');
    await page.locator('.landing-begin').first().focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/journey');
    await page.waitForSelector('.logo-transition', { state: 'detached' });
    await page.goBack();
    await page.waitForSelector('.logo-transition', { state: 'detached' });
    await page.goForward();
    await page.waitForURL('**/journey');
    await page.waitForSelector('.logo-transition', { state: 'detached' });
    await page.goBack();
    await page.waitForSelector('.logo-transition', { state: 'detached' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await page.close();
    console.log('PASS landscape, keyboard, normal motion and browser Forward');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
