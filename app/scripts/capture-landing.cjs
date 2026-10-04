// Run with Playwright and sharp available through NODE_PATH. Captures the real Journey UI.
// Start Vite first; optionally pass its URL as the first argument.
const { chromium } = require('playwright');
const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.argv[2] || 'http://127.0.0.1:5173';
const output = path.resolve(__dirname, '../public/images/landing');

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const locale of ['ar', 'en']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', deviceScaleFactor: 1.5 });
      await page.addInitScript(() => sessionStorage.setItem('bidaya.intro.seen', '1'));
      await page.goto(`${base}/journey`);
      await page.waitForSelector('.scrolly-map');
      await page.waitForSelector('.logo-transition', { state: 'detached' });
      if (locale === 'en') await page.locator('.language-switch').click();
      await page.evaluate(() => document.fonts.ready);
      // Resolve stable Dorar IDs against the current dataset; row positions can change.
      const eventIndices = await page.evaluate(async () => {
        const { getSirah } = await import('/src/data/load.ts');
        const data = await getSirah();
        return Object.fromEntries(data.events.map((event, index) => [event.n, index]));
      });
      const settle = () => page.waitForTimeout(500);
      const save = async (name, clip) => {
        const bytes = await page.screenshot({ clip, animations: 'disabled' });
        const file = `${name}-${locale}.webp`;
        const info = await sharp(bytes).resize({ width: Math.min(1600, Math.round(clip.width * 1.5)), withoutEnlargement: true }).webp({ quality: 86 }).toFile(path.join(output, file));
        console.log(file, info.width, info.height);
      };
      const crop = async (name, selector, maxHeight = 550) => {
        const box = await page.locator(selector).first().boundingBox();
        if (!box) throw new Error(`Missing ${selector}`);
        // Screenshots use viewport coordinates. Keep sticky UI in the same position.
        await save(name, { x: Math.max(0, box.x), y: Math.max(0, box.y), width: box.width, height: Math.min(maxHeight, box.height, 900 - Math.max(0, box.y)) });
      };
      const pick = async number => {
        const index = eventIndices[number];
        if (index === undefined) throw new Error(`Missing Dorar event ${number}`);
        await page.locator(`.tl-tick[data-i="${index}"]`).evaluate(el => el.click());
        await settle();
        await page.waitForSelector(`#ev-${number}`);
      };
      // Chapter overview, then the first revelation: both selected in the working UI.
      await page.locator('.tb-chapter').nth(1).click();
      await settle();
      await crop('chapters', '.step-chapter.is-on', 500);
      await pick(12);
      await save('overview', { x: 69, y: 72, width: 1286, height: 730 });
      await crop('place', '.hmap-frame', 540);
      const verse = page.locator('.ecard .ecard-section').filter({ has: page.locator('.verses') }).first();
      await verse.scrollIntoViewIfNeeded();
      await settle();
      if (await verse.count()) {
        const box = await verse.boundingBox();
        await save('verses', { x: box.x, y: Math.max(0, box.y), width: box.width, height: Math.min(300, box.height, 900 - Math.max(0, box.y)) });
      }
      // A real cited person summary.
      await pick(9);
      await page.locator('.ecard-people button').first().click();
      await settle();
      await crop('people', '.person-dialog[open]', 360);
      await page.locator('.person-dialog[open] .qr-close').click();
      // Hijrah event and its route walk.
      await page.locator('.tb-chapter').nth(2).click();
      await pick(42);
      await page.locator('.ecard-walk').click();
      await settle();
      await crop('route', '.hmap-frame', 720);
      await page.locator('.walk-close').filter({ visible: true }).first().click();
      // A source reference from the selected event.
      await pick(42);
      await page.locator('.ecard-source').scrollIntoViewIfNeeded();
      await settle();
      await crop('source', '.ecard-source', 130);
      // Actual answer from the local source retrieval, never invented sample text.
      await page.locator('.ask-bar input').fill(locale === 'ar' ? 'متى كانت غزوة بدر؟' : 'When was the Battle of Badr?');
      await page.locator('.ask-bar').evaluate(form => form.requestSubmit());
      await page.waitForSelector('.answer-text');
      await settle();
      await crop('ask', '.answer-card', 350);
      await page.locator('.answer-card .walk-close').click();
      await page.locator('.tb-quiz').click();
      await settle();
      await crop('quiz', '.quick-quiz', 380);
      await page.locator('.quick-quiz .walk-close').click();
      // The mobile preview is captured at its real layout, not a squeezed desktop image.
      await page.setViewportSize({ width: 390, height: 844 });
      await pick(12);
      await save('overview-mobile', { x: 16, y: 60, width: 358, height: 720 });
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
