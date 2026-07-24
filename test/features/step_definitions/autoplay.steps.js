import { Given, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { classifiedGrid } from '../support/board-reader.js';
import { findHighlight } from './interaction.steps.js';

Given('I record the cursor position', async function () {
  const [cursor] = await findHighlight(this.page, 'cursor');
  this.recordedCursor = cursor;
});

Then('the cursor has moved exactly one step right of the position recorded before', async function () {
  const [cursor] = await findHighlight(this.page, 'cursor');
  assert.deepEqual(cursor, { row: this.recordedCursor.row, col: this.recordedCursor.col + 1 });
});

Then('autoplay is off', async function () {
  const on = await this.page.evaluate(() => window.MagicGems.isAutoplayOn());
  assert.equal(on, false);
});

Then('autoplay is on', async function () {
  const on = await this.page.evaluate(() => window.MagicGems.isAutoplayOn());
  assert.equal(on, true);
});

Then('the autoplay instruction line reads {string} in the pixel font, below the grid', async function (expectedText) {
  const result = await this.page.evaluate(async () => {
    await document.fonts.ready;
    const hintEl = document.getElementById('autoplay-hint');
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
  assert.ok(result.isBelowGrid, 'expected the autoplay instruction line to sit below the grid');
});

Then('the board settles into a new, match-free arrangement within a generous real timeout', async function () {
  // isAnimating() alone is trivially true-before-anything-starts right after
  // toggling autoplay on (its own first move hasn't been scheduled yet) - wait
  // for real evidence a completion actually happened first (the score leaving
  // its starting value, true for every fresh-load scenario using this step),
  // then for any in-flight animation to fully drain.
  await this.page.waitForFunction(
    () => document.getElementById('score').textContent !== 'Score: 0',
    null,
    { timeout: 15000 }
  );
  await this.page.waitForFunction(() => !window.MagicGems.isAnimating(), null, { timeout: 15000 });
  const grid = await classifiedGrid(this.page);
  const noMatch = await this.page.evaluate((g) => window.MagicGems.hasMatch(g), grid);
  assert.equal(noMatch, false, 'expected the settled board to have no remaining match');
});

Then('at least one real interval between two autoplay key presses was not instantaneous', async function () {
  const log = await this.page.evaluate(() => window.MagicGems.getAutoplayKeyLog());
  assert.ok(log.length >= 2, `expected at least two logged autoplay key presses, got ${log.length}`);
  const gaps = [];
  for (let i = 1; i < log.length; i++) gaps.push(log[i].ts - log[i - 1].ts);
  assert.ok(
    gaps.some((gap) => gap >= 300),
    `expected at least one real, visible gap (>=300ms) between autoplay key presses, got ${JSON.stringify(gaps)}`
  );
});

Then('injecting an arrow key, SPACE, and Escape right now has no effect on the cursor or selection', async function () {
  // Done as one synchronous in-page pass (not separate Playwright round-trips) so
  // this reliably runs well inside the gap before autoplay's own first scheduled
  // move - autoplay is real and running, so any inter-step delay here would race it.
  const result = await this.page.evaluate(() => {
    const before = JSON.stringify(window.MagicGems.getInteractionState());
    for (const key of ['ArrowRight', ' ', 'Escape']) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key }));
    }
    const after = JSON.stringify(window.MagicGems.getInteractionState());
    return { before, after };
  });
  assert.equal(result.after, result.before, 'expected injected input to have no effect on cursor/selection while autoplay is on');
});

Then('the score reads greater than 0', async function () {
  const score = await this.page.evaluate(() => Number(document.getElementById('score').textContent.replace('Score: ', '')));
  assert.ok(score > 0, `expected the score to have increased, was ${score}`);
});

Then('the autoplay indicator is hidden', async function () {
  const visibility = await this.page.evaluate(
    () => getComputedStyle(document.getElementById('autoplay-indicator')).visibility
  );
  assert.equal(visibility, 'hidden');
});

Then('the autoplay indicator reads {string} above the score, blinking, in the pixel font', async function (expectedText) {
  const result = await this.page.evaluate(() => {
    const indicatorEl = document.getElementById('autoplay-indicator');
    const scoreRect = document.getElementById('score').getBoundingClientRect();
    const indicatorRect = indicatorEl.getBoundingClientRect();
    const style = getComputedStyle(indicatorEl);
    return {
      text: indicatorEl.textContent,
      fontFamily: style.fontFamily,
      visibility: style.visibility,
      animationName: style.animationName,
      isAboveScore: indicatorRect.bottom <= scoreRect.top,
    };
  });
  assert.equal(result.text, expectedText);
  assert.ok(result.fontFamily.includes('Press Start 2P'), `expected the pixel font, got "${result.fontFamily}"`);
  assert.equal(result.visibility, 'visible');
  assert.notEqual(result.animationName, 'none', 'expected a CSS blink animation to be applied');
  assert.ok(result.isAboveScore, 'expected the indicator to sit above the score');
});
