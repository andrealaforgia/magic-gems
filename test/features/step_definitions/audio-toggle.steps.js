import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

Then('audio is muted', async function () {
  const muted = await this.page.evaluate(() => window.MagicGems.isAudioMuted());
  assert.equal(muted, true);
});

Then('audio is unmuted', async function () {
  const muted = await this.page.evaluate(() => window.MagicGems.isAudioMuted());
  assert.equal(muted, false);
});

Then('the audio instruction line reads {string} in the pixel font, below the grid', async function (expectedText) {
  const result = await this.page.evaluate(async () => {
    await document.fonts.ready;
    const hintEl = document.getElementById('audio-hint');
    const canvasRect = document.getElementById('board').getBoundingClientRect();
    const hintRect = hintEl.getBoundingClientRect();
    return {
      text: hintEl.textContent,
      fontFamily: getComputedStyle(hintEl).fontFamily,
      pixelFontLoaded: [...document.fonts].some((f) => f.family === 'Press Start 2P' && f.status === 'loaded'),
      isBelowGrid: hintRect.top >= canvasRect.bottom,
    };
  });
  assert.equal(result.text, expectedText);
  assert.ok(result.fontFamily.includes('Press Start 2P'), `expected the pixel font, got "${result.fontFamily}"`);
  assert.ok(result.pixelFontLoaded, 'expected the "Press Start 2P" font to have actually loaded');
  assert.ok(result.isBelowGrid, 'expected the instruction line to sit below the grid');
});

Then('the {string} toast is visible in the pixel font', async function (expectedText) {
  const result = await this.page.evaluate(() => {
    const toastEl = document.getElementById('audio-toast');
    return {
      text: toastEl.textContent,
      opacity: Number(getComputedStyle(toastEl).opacity),
      fontFamily: getComputedStyle(toastEl).fontFamily,
    };
  });
  assert.equal(result.text, expectedText);
  assert.ok(result.opacity > 0.9, `expected the toast to be visible, opacity was ${result.opacity}`);
  assert.ok(result.fontFamily.includes('Press Start 2P'), `expected the pixel font, got "${result.fontFamily}"`);
});

Then('the audio toast fades away', async function () {
  await this.page.waitForFunction(
    () => Number(getComputedStyle(document.getElementById('audio-toast')).opacity) < 0.1,
    null,
    { timeout: 3000 }
  );
});
