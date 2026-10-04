const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.argv[2] || 'http://127.0.0.1:5184';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const [width, locale, motion] of [[1440, 'en', 'no-preference'], [390, 'ar', 'no-preference'], [1440, 'ar', 'reduce'], [390, 'en', 'reduce']]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: motion });
      await context.addInitScript(language => { sessionStorage.setItem('bidaya.intro.seen', '1'); localStorage.setItem('bidaya.locale', language); }, locale);
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/journey`);
      await page.waitForSelector('.logo-transition', { state: 'detached' });
      await page.waitForSelector('.story-toolbar');
      const wide = width > 1000;
      if (!wide) await page.locator('.tb-ask').click();
      const input = page.locator(wide ? '.ask-bar input' : '.ask-panel .mo-field');
      const icon = page.locator(wide ? '.ask-bar-history' : '.ask-panel .mo-history');
      const composer = page.locator(wide ? '.ask-bar' : '.ask-panel .mo-actor');
      const before = await composer.boundingBox();
      await input.fill('Draft'); await icon.click();
      await page.waitForSelector('.chat-history[open]');
      assert.equal(await page.locator('.chat-history-list li').count(), 0);
      await page.keyboard.press('Escape');
      await page.waitForSelector('.chat-history', { state: 'detached' });
      assert.equal(await input.inputValue(), 'Draft');
      const after = await composer.boundingBox(); assert.ok(Math.abs(before.height - after.height) < 1);
      const svg = await icon.locator('svg').boundingBox(); assert.equal(svg.width, 32);
      const question = locale === 'ar' ? 'متى كانت غزوة بدر؟' : 'When was the Battle of Badr?';
      await input.fill(question); await input.press('Enter');
      const response = page.locator(wide ? '.answer-card .mo-root' : '.ask-panel .mo-root');
      await response.waitFor();
      if (motion !== 'reduce') {
        await page.waitForFunction(selector => document.querySelector(selector)?.dataset.phase === 'think', wide ? '.answer-card .mo-root' : '.ask-panel .mo-root');
        await page.screenshot({ path: `qa/ai-globe-${width}-${locale}.png` });
      }
      await page.waitForFunction(selector => document.querySelector(selector)?.dataset.phase === 'answered', wide ? '.answer-card .mo-root' : '.ask-panel .mo-root', { timeout: 15000 });
      assert.ok((await response.locator('.mo-a-body').innerText()).length > 30);
      assert.ok((await response.locator('.mo-a-body').innerText()).includes(locale === 'ar' ? 'المصدر' : 'Source'));
      if (wide) assert.equal(await response.locator('form').isVisible(), false);
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bidaya.chats.v1')));
      assert.equal(stored.length, 1); assert.equal(stored[0].question, question);
      await page.screenshot({ path: `qa/ai-answer-${width}-${locale}.png` });
      if (!wide) { await response.locator('.mo-reset').click(); await page.waitForFunction(() => document.querySelector('.ask-panel .mo-root')?.dataset.phase === 'idle'); }
      await icon.click();
      assert.equal(await page.locator('.chat-history-list li').count(), 1);
      await page.screenshot({ path: `qa/ai-history-${width}-${locale}.png` });
      await page.keyboard.press('Escape');
      await page.reload(); await page.waitForSelector('.logo-transition', { state: 'detached' });
      if (await page.locator('.resume-dialog[open]').count()) await page.locator('.resume-dialog .btn-primary').click();
      if (!wide) await page.locator('.tb-ask').click();
      await icon.click();
      assert.equal(await page.locator('.chat-history-list li').count(), 1);
      await page.locator('.chat-history > .btn-quiet').click();
      assert.equal(await page.locator('.chat-history-list li').count(), 0);
      assert.equal(await page.evaluate(() => localStorage.getItem('bidaya.chats.v1')), null);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      console.log(`AI response, unchanged pill, history persistence/clear passed: ${width}px ${locale} ${motion}`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
