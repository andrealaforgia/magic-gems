import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { VIEWPORT_CENTER_TOLERANCE_RATIO } from '../support/pixel-utils.js';

Then('the exit confirmation overlay is not shown', async function () {
  const hidden = await this.page.evaluate(() => document.getElementById('exit-confirm').hidden);
  assert.equal(hidden, true, 'expected the exit confirmation overlay to be hidden');
});

Then(
  'the exit confirmation overlay is shown, reading exactly {string}, centred, in the pixel font',
  async function (expectedText) {
    const result = await this.page.evaluate(async () => {
      await document.fonts.ready;
      const el = document.getElementById('exit-confirm');
      const rect = el.getBoundingClientRect();
      return {
        hidden: el.hidden,
        text: el.textContent,
        fontFamily: getComputedStyle(el).fontFamily,
        pixelFontLoaded: [...document.fonts].some((f) => f.family === 'Press Start 2P' && f.status === 'loaded'),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    });
    assert.equal(result.hidden, false, 'expected the exit confirmation overlay to be visible');
    assert.equal(result.text, expectedText);
    assert.ok(result.fontFamily.includes('Press Start 2P'), `expected the pixel font, got "${result.fontFamily}"`);
    assert.ok(result.pixelFontLoaded, 'expected the "Press Start 2P" font to have actually loaded');

    const viewport = this.page.viewportSize();
    const overlayCenter = { x: result.rect.x + result.rect.width / 2, y: result.rect.y + result.rect.height / 2 };
    const viewportCenter = { x: viewport.width / 2, y: viewport.height / 2 };
    const dx = Math.abs(overlayCenter.x - viewportCenter.x);
    const dy = Math.abs(overlayCenter.y - viewportCenter.y);
    assert.ok(dx < viewport.width * VIEWPORT_CENTER_TOLERANCE_RATIO, `overlay center x off by ${dx}px`);
    assert.ok(dy < viewport.height * VIEWPORT_CENTER_TOLERANCE_RATIO, `overlay center y off by ${dy}px`);
  }
);

Then('the start screen is shown again', async function () {
  const hidden = await this.page.evaluate(() => document.getElementById('start-screen').hidden);
  assert.equal(hidden, false, 'expected the start screen to be shown again after exiting');
});

Then('the cursor has not moved from the position recorded before', async function () {
  const state = await this.page.evaluate(() => window.MagicGems.getInteractionState());
  assert.deepEqual(state.cursor, this.recordedCursor, 'expected the cursor to stay exactly where it was recorded');
});

Then('exactly one single-player session is active', async function () {
  // A restart's own boot is still finishing its async sprite load right after
  // waitForBoardReady resolves (that helper's own sprite check can pass on a
  // still-live previous session's stale sprites before the new one lands) -
  // wait for the count to actually settle rather than sampling once, which
  // would race the real value it's trying to observe.
  await this.page.waitForFunction(
    () => window.MagicGems.getActiveSinglePlayerSessions() === 1,
    null,
    { timeout: 2000 }
  );
  const count = await this.page.evaluate(() => window.MagicGems.getActiveSinglePlayerSessions());
  assert.equal(count, 1, `expected exactly one active single-player session, found ${count}`);
});
