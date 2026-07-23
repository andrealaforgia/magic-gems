import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import {
  GLOW_EDGE_LUMA_FRACTION,
  CORE_EDGE_LUMA_FRACTION,
  MIN_GLOW_FADE_SPAN_PX,
} from '../support/pixel-utils.js';
import { findHighlight } from './interaction.steps.js';

const REAL_INTERVAL_MS = 200;

async function readFragments(page) {
  return page.evaluate(() => window.MagicGems.getActiveFragments().map((f) => ({ x: f.x, y: f.y, vx: f.vx, vy: f.vy })));
}

Then('multiple fragments are actively animating', async function () {
  await this.page.waitForFunction(
    () => window.MagicGems.getActiveFragments().length >= 4,
    null,
    { timeout: 3000 }
  );
});

Then('no fragments remain', async function () {
  const fragments = await readFragments(this.page);
  assert.equal(fragments.length, 0, `expected no active fragments, found ${fragments.length}`);
});

Given('I capture the active fragment positions', async function () {
  await this.page.waitForFunction(
    () => window.MagicGems.getActiveFragments().length > 0,
    null,
    { timeout: 3000 }
  );
  this.fragmentPositions = await readFragments(this.page);
});

Given('a brief real interval passes', async function () {
  await this.page.waitForTimeout(REAL_INTERVAL_MS);
});

Then('the fragment positions have changed since the last capture', async function () {
  const current = await readFragments(this.page);
  assert.ok(current.length > 0, 'no fragments left to compare - the shatter already finished');
  assert.equal(current.length, this.fragmentPositions.length, 'fragment count changed between captures');
  const anyMoved = current.some((f, i) => f.x !== this.fragmentPositions[i].x || f.y !== this.fragmentPositions[i].y);
  assert.ok(anyMoved, 'no fragment changed position over the interval');
});

Then('at least one fragment shows lateral drift since the last capture', async function () {
  const current = await readFragments(this.page);
  assert.ok(current.length > 0, 'no fragments left to compare - the shatter already finished');
  const anyLateral = current.some((f, i) => f.x !== this.fragmentPositions[i].x);
  assert.ok(anyLateral, 'no fragment moved horizontally - motion looked like a perfectly straight vertical fall');
});

Given('I record the fragment velocity pattern', async function () {
  await this.page.waitForFunction(
    () => window.MagicGems.getActiveFragments().length > 0,
    null,
    { timeout: 3000 }
  );
  const fragments = await readFragments(this.page);
  this.recordedVelocityPattern = fragments.map((f) => [f.vx, f.vy]);
});

Then('the fragment velocity pattern differs from the recorded one', async function () {
  await this.page.waitForFunction(
    () => window.MagicGems.getActiveFragments().length > 0,
    null,
    { timeout: 3000 }
  );
  const fragments = await readFragments(this.page);
  const current = fragments.map((f) => [f.vx, f.vy]);
  assert.notDeepEqual(current, this.recordedVelocityPattern, 'two separate shatters replayed an identical fragment pattern');
});

Then('a selection highlight is present, proving the game accepted input immediately', async function () {
  const found = await findHighlight(this.page, 'selection');
  assert.equal(found.length, 1, `expected exactly one selection highlight, found ${found.length}`);
});

Then('an unaffected gem elsewhere on the board still shows its neon glow fade', async function () {
  const { fadeSpan } = await this.page.evaluate(
    ({ glowFraction, coreFraction }) => {
      const canvas = document.getElementById('board');
      const ctx = canvas.getContext('2d');
      const cellSize = canvas.width / 8;
      // Row/col 7 (bottom-right) is far from any default-cursor or typical
      // top-left-biased swap search result, and still holds an original gem.
      const cx = Math.round(7 * cellSize + cellSize / 2);
      const cy = Math.round(7 * cellSize + cellSize / 2);
      const rightEdge = Math.round(7 * cellSize + cellSize - 1);
      const data = ctx.getImageData(cx, cy, rightEdge - cx, 1).data;
      const luma = [];
      for (let x = 0; x < (rightEdge - cx); x++) {
        luma.push((data[x * 4] + data[x * 4 + 1] + data[x * 4 + 2]) / 3);
      }
      const maxLuma = Math.max(...luma);
      const backgroundLuma = luma[luma.length - 1];
      const glowThreshold = backgroundLuma + (maxLuma - backgroundLuma) * glowFraction;
      const coreThreshold = backgroundLuma + (maxLuma - backgroundLuma) * coreFraction;
      let glowStart = -1;
      let coreStart = -1;
      for (let i = luma.length - 1; i >= 0; i--) {
        if (glowStart === -1 && luma[i] > glowThreshold) glowStart = i;
        if (luma[i] > coreThreshold) coreStart = i;
      }
      return { fadeSpan: glowStart === -1 || coreStart === -1 ? -1 : glowStart - coreStart };
    },
    { glowFraction: GLOW_EDGE_LUMA_FRACTION, coreFraction: CORE_EDGE_LUMA_FRACTION }
  );

  assert.ok(fadeSpan >= MIN_GLOW_FADE_SPAN_PX, `expected a glow fade of at least ${MIN_GLOW_FADE_SPAN_PX}px on an unaffected gem, measured ${fadeSpan}px`);
});
