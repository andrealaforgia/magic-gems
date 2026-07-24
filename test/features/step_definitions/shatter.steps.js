import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { classifyColor } from '../support/pixel-utils.js';
import { readGemPalette } from '../support/board-reader.js';
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

Then('every active fragment carries a real crop of the cleared gem\'s own sprite image, not a flat colour', async function () {
  const fragmentInfo = await this.page.evaluate(() => {
    const fragments = window.MagicGems.getActiveFragments();
    const sprites = window.MagicGems.getSpriteImages();
    return fragments.map((f) => {
      const gemType = Object.keys(sprites).find((type) => sprites[type] === f.sprite);
      const inBounds =
        !!f.sprite &&
        f.sx >= 0 &&
        f.sy >= 0 &&
        f.sw > 0 &&
        f.sh > 0 &&
        f.sx + f.sw <= f.sprite.naturalWidth + 1e-6 &&
        f.sy + f.sh <= f.sprite.naturalHeight + 1e-6;
      return { hasSprite: !!f.sprite, hasColor: 'color' in f, gemType, inBounds };
    });
  });

  assert.ok(fragmentInfo.length > 0, 'expected active fragments to inspect');
  for (const info of fragmentInfo) {
    assert.ok(info.hasSprite, 'every fragment must carry a real sprite image reference');
    assert.ok(!info.hasColor, 'no fragment may fall back to a flat colour');
    assert.ok(info.gemType, 'a fragment\'s sprite must be one of the live page\'s own loaded gem sprites, not an unrelated image');
    assert.ok(info.inBounds, 'a fragment\'s crop must be a real, in-bounds region of its own sprite');
  }
});

Then('an unaffected gem elsewhere on the board still renders a recognizable gem', async function () {
  const palette = await readGemPalette(this.page);
  const rgb = await this.page.evaluate(() => {
    const canvas = document.getElementById('board');
    const ctx = canvas.getContext('2d');
    const cellSize = canvas.width / 8;
    // Row/col 7 (bottom-right) is far from any default-cursor or typical
    // top-left-biased swap search result, and still holds an original gem.
    const cx = Math.round(7 * cellSize + cellSize / 2);
    const cy = Math.round(7 * cellSize + cellSize / 2);
    const [r, g, b] = ctx.getImageData(cx, cy, 1, 1).data;
    return [r, g, b];
  });

  assert.ok(
    classifyColor(rgb, palette) !== null,
    'expected cell (7,7) to still show a recognizable sprite gem while a shatter plays elsewhere'
  );
});
