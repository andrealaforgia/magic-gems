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

Then('the {string} toast is visible, large and white, in the pixel font', async function (expectedText) {
  const result = await this.page.evaluate(() => {
    const toastEl = document.getElementById('audio-toast');
    const style = getComputedStyle(toastEl);
    return {
      text: toastEl.textContent,
      opacity: Number(style.opacity),
      fontFamily: style.fontFamily,
      color: style.color,
      fontSizePx: parseFloat(style.fontSize),
    };
  });
  assert.equal(result.text, expectedText);
  assert.ok(result.opacity > 0.9, `expected the toast to be visible, opacity was ${result.opacity}`);
  assert.ok(result.fontFamily.includes('Press Start 2P'), `expected the pixel font, got "${result.fontFamily}"`);
  assert.equal(result.color, 'rgb(255, 255, 255)', `expected white text, got "${result.color}"`);
  // SPEC 11.5.1: about 3x an ordinary UI label - the previous toast size (1.5rem,
  // 24px at the default root size) tripled is 72px; 60px is a safe lower bound
  // that still confirms a real, large jump rather than a marginal size tweak.
  assert.ok(result.fontSizePx >= 60, `expected a large, ~3x-sized toast, got ${result.fontSizePx}px`);
});

Then('the audio toast fades away', async function () {
  await this.page.waitForFunction(
    () => Number(getComputedStyle(document.getElementById('audio-toast')).opacity) < 0.1,
    null,
    { timeout: 3000 }
  );
});
