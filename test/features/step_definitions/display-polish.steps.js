import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { findHighlight } from './interaction.steps.js';

Then('the score is rendered in the "Press Start 2P" pixel font, left-aligned', async function () {
  const result = await this.page.evaluate(async () => {
    await document.fonts.ready;
    const scoreEl = document.getElementById('score');
    const scoreRect = scoreEl.getBoundingClientRect();
    const hudRect = document.getElementById('hud').getBoundingClientRect();
    return {
      fontFamily: getComputedStyle(scoreEl).fontFamily,
      pixelFontLoaded: [...document.fonts].some((f) => f.family === 'Press Start 2P' && f.status === 'loaded'),
      textAlign: getComputedStyle(scoreEl).textAlign,
      leftOffset: scoreRect.left - hudRect.left,
    };
  });
  assert.ok(
    result.fontFamily.includes('Press Start 2P'),
    `expected the score's font-family to include "Press Start 2P", got "${result.fontFamily}"`
  );
  assert.ok(result.pixelFontLoaded, 'expected the "Press Start 2P" font to have actually loaded, not just be declared in CSS');
  assert.equal(result.textAlign, 'left', `expected the score to be left-aligned, got text-align "${result.textAlign}"`);
  assert.ok(result.leftOffset < 2, `expected the score flush against the header's left edge, was offset by ${result.leftOffset}px`);
});

// Component-level: proves the real, unmodified multiplierFraction/multiplierBarColor
// functions (the same ones main.js calls) produce a proportional fill and a smooth
// green-to-red shift at representative high/middle/low values (SPEC 10.8) - not a
// flat single colour and not an abrupt two-tone jump.
Then('the multiplier bar\'s fill and colour are proportional and shift through green, yellow, and red at high, middle, and low values', async function () {
  const result = await this.page.evaluate(() => {
    const { multiplierFraction, multiplierBarColor, TIME_MULTIPLIER_START } = window.MagicGems;
    return [5000, 2500, 0].map((multiplier) => {
      const fraction = multiplierFraction(multiplier, TIME_MULTIPLIER_START);
      return { multiplier, fraction, color: multiplierBarColor(fraction) };
    });
  });
  const [high, mid, low] = result;
  assert.equal(high.fraction, 1, 'expected a full multiplier to fill the bar completely');
  assert.equal(mid.fraction, 0.5, 'expected a half multiplier to half-fill the bar');
  assert.equal(low.fraction, 0, 'expected an empty multiplier to leave the bar empty');
  assert.match(high.color, /hsl\(120,/, 'expected a full bar to be green');
  assert.match(mid.color, /hsl\(60,/, 'expected a half-full bar to be yellow');
  assert.match(low.color, /hsl\(0,/, 'expected an empty bar to be red');
});

Then('the multiplier bar fills all the remaining width beside the score, at a generous height, and is full and green on a fresh load', async function () {
  const result = await this.page.evaluate(() => {
    const fillEl = document.getElementById('multiplier-fill');
    const barEl = document.getElementById('multiplier-bar');
    const scoreEl = document.getElementById('score');
    const hudRect = document.getElementById('hud').getBoundingClientRect();
    const barRect = barEl.getBoundingClientRect();
    const fillRect = fillEl.getBoundingClientRect();
    const scoreRect = scoreEl.getBoundingClientRect();
    const [r, g, b] = getComputedStyle(fillEl).backgroundColor.match(/\d+/g).map(Number);
    return {
      fillWidth: fillRect.width,
      barContentWidth: barEl.clientWidth,
      r, g, b,
      barHeight: barRect.height,
      rightEdgeGap: hudRect.right - barRect.right,
      startsAfterScore: barRect.left >= scoreRect.right,
    };
  });
  assert.ok(
    result.barContentWidth - result.fillWidth < 2,
    `expected the fill to span the bar's full content width, fill was ${result.fillWidth}px of ${result.barContentWidth}px`
  );
  assert.ok(result.g > result.r && result.g > result.b, `expected a green-dominant colour, got rgb(${result.r},${result.g},${result.b})`);
  assert.ok(result.rightEdgeGap < 2, `expected the bar to reach the header's right edge, was short by ${result.rightEdgeGap}px`);
  assert.ok(result.startsAfterScore, 'expected the bar to sit to the right of the score');
  assert.ok(result.barHeight >= 24, `expected a generous bar height, got ${result.barHeight}px`);
});

Then('the multiplier bar\'s fill width visibly decreases after a short real interval', async function () {
  const readWidth = () => this.page.evaluate(() => document.getElementById('multiplier-fill').style.width);
  const before = await readWidth();
  await this.page.waitForTimeout(1100);
  const after = await readWidth();
  assert.ok(
    parseFloat(after) < parseFloat(before),
    `expected the bar's fill width to decrease after ~1s, was ${before}, still ${after}`
  );
});

// SPEC 3.5: every cell has a solid checkerboard background, sampled well away from
// the centred gem sprite so this reads the background specifically, not whichever
// gem happens to be sitting on it. Whichever cell(s) currently show a cursor/
// selection/target highlight ring are skipped - their ring is drawn on top of the
// background, not a violation of the checkerboard existing underneath it, just not
// observable by sampling right at their corner (the ring's own stroke runs all the
// way round each highlighted cell's inset perimeter).
Then('every one of the 64 cells shows a checkerboard background alternating between the two shipped shades', async function () {
  const [cursor, selection, target] = await Promise.all([
    findHighlight(this.page, 'cursor'),
    findHighlight(this.page, 'selection'),
    findHighlight(this.page, 'target'),
  ]);
  const highlighted = new Set([...cursor, ...selection, ...target].map(({ row, col }) => `${row},${col}`));

  const result = await this.page.evaluate(() => {
    const canvas = document.getElementById('board');
    const ctx = canvas.getContext('2d');
    const size = 8;
    const cellSize = canvas.width / size;
    const grid = [];
    for (let row = 0; row < size; row++) {
      const rowShades = [];
      for (let col = 0; col < size; col++) {
        const x = Math.round(col * cellSize + 2);
        const y = Math.round(row * cellSize + 2);
        const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
        rowShades.push(`#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`);
      }
      grid.push(rowShades);
    }
    return grid;
  });

  const isHighlighted = (row, col) => highlighted.has(`${row},${col}`);

  const shades = new Set(
    result.flatMap((row, r) => row.filter((_, c) => !isHighlighted(r, c)))
  );
  assert.deepEqual([...shades].sort(), ['#1a1a1a', '#242424'], `expected exactly the two shipped shades, saw ${[...shades]}`);

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (col + 1 < 8 && !isHighlighted(row, col) && !isHighlighted(row, col + 1)) {
        assert.notEqual(result[row][col], result[row][col + 1], `expected (${row},${col}) and (${row},${col + 1}) to differ`);
      }
      if (row + 1 < 8 && !isHighlighted(row, col) && !isHighlighted(row + 1, col)) {
        assert.notEqual(result[row][col], result[row + 1][col], `expected (${row},${col}) and (${row + 1},${col}) to differ`);
      }
    }
  }
});
