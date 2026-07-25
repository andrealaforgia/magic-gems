import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { loadMagicGems } from '../../support/load-src.js';

const { hasMatch, applySwap } = loadMagicGems([
  new URL('../../../src/gems.js', import.meta.url),
  new URL('../../../src/board.js', import.meta.url),
  new URL('../../../src/resolution.js', import.meta.url),
]);

function findAdjacentSwap(grid, wantMatch) {
  const size = grid.length;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (col + 1 < size) {
        const a = { row, col };
        const b = { row, col: col + 1 };
        if (hasMatch(applySwap(grid, a, b)) === wantMatch) return { a, b };
      }
      if (row + 1 < size) {
        const a = { row, col };
        const b = { row: row + 1, col };
        if (hasMatch(applySwap(grid, a, b)) === wantMatch) return { a, b };
      }
    }
  }
  throw new Error(`could not find an adjacent swap on the live match board with wantMatch=${wantMatch}`);
}

function directionKey(from, to) {
  if (to.row === from.row + 1) return 'ArrowDown';
  if (to.row === from.row - 1) return 'ArrowUp';
  if (to.col === from.col + 1) return 'ArrowRight';
  if (to.col === from.col - 1) return 'ArrowLeft';
  throw new Error(`cells are not orthogonally adjacent: ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
}

async function moveCursorTo(page, from, to) {
  const verticalKey = to.row > from.row ? 'ArrowDown' : 'ArrowUp';
  for (let i = 0; i < Math.abs(to.row - from.row); i++) await page.keyboard.press(verticalKey);
  const horizontalKey = to.col > from.col ? 'ArrowRight' : 'ArrowLeft';
  for (let i = 0; i < Math.abs(to.col - from.col); i++) await page.keyboard.press(horizontalKey);
}

function pageFor(world, which) {
  return which === 'first' ? world.pageA : world.pageB;
}

Given("I locate an adjacent swap that would produce a match on the second page's local match board", async function () {
  const grid = await this.pageB.evaluate(() => window.MagicGems.getMatchBoard());
  this.matchFoundSwapB = findAdjacentSwap(grid, true);
});

When("I commit that swap on the second page's local match board", async function () {
  const { a, b } = this.matchFoundSwapB;
  const { cursor } = await this.pageB.evaluate(() => window.MagicGems.getMatchInteractionState());

  await moveCursorTo(this.pageB, cursor, a);
  await this.pageB.keyboard.press(' ');
  await this.pageB.keyboard.press(directionKey(a, b));
  await this.pageB.keyboard.press(' ');
});

Then("the second page's local match score has increased", async function () {
  await this.pageB.waitForFunction(() => window.MagicGems.getMatchScore() > 0, null, { timeout: 5000 });
  const score = await this.pageB.evaluate(() => window.MagicGems.getMatchScore());
  assert.ok(score > 0, `expected a positive score, got ${score}`);
});

Then("the first page's own match multiplier bar is shown, in the pixel font", async function () {
  const result = await this.pageA.evaluate(async () => {
    await document.fonts.ready;
    const el = document.getElementById('match-multiplier-message');
    return {
      hidden: document.getElementById('match-multiplier-bar').hidden,
      fontFamily: getComputedStyle(el).fontFamily,
      multiplier: document.getElementById('match-multiplier-fill').dataset.multiplier,
    };
  });
  assert.equal(result.hidden, false, 'expected the multiplier bar to be visible');
  assert.ok(result.fontFamily.includes('Press Start 2P'), `expected the pixel font, got "${result.fontFamily}"`);
  assert.ok(result.multiplier !== undefined && result.multiplier !== '', 'expected a real multiplier reading');
});

Then("the second page's own local match score is still exactly zero", async function () {
  const score = await this.pageB.evaluate(() => window.MagicGems.getMatchScore());
  assert.equal(score, 0);
});

Then('audio is unmuted on both pages', async function () {
  assert.equal(await this.pageA.evaluate(() => window.MagicGems.isMatchAudioMuted()), false);
  assert.equal(await this.pageB.evaluate(() => window.MagicGems.isMatchAudioMuted()), false);
});

When('I press {string} on the {word} page', async function (key, which) {
  await pageFor(this, which).keyboard.press(key);
});

Then('audio is muted on the second page', async function () {
  assert.equal(await this.pageB.evaluate(() => window.MagicGems.isMatchAudioMuted()), true);
});

Then('audio is unmuted on the first page', async function () {
  assert.equal(await this.pageA.evaluate(() => window.MagicGems.isMatchAudioMuted()), false);
});

Then('autoplay is off on both pages', async function () {
  assert.equal(await this.pageA.evaluate(() => window.MagicGems.isMatchAutoplayOn()), false);
  assert.equal(await this.pageB.evaluate(() => window.MagicGems.isMatchAutoplayOn()), false);
});

Then('autoplay is on on the first page', async function () {
  assert.equal(await this.pageA.evaluate(() => window.MagicGems.isMatchAutoplayOn()), true);
});

Then('autoplay is off on the second page', async function () {
  assert.equal(await this.pageB.evaluate(() => window.MagicGems.isMatchAutoplayOn()), false);
});

Then("the second page's match exit overlay is shown", async function () {
  const hidden = await this.pageB.evaluate(() => document.getElementById('match-exit-confirm').hidden);
  assert.equal(hidden, false);
});

Then("the first page's match exit overlay is not shown", async function () {
  const hidden = await this.pageA.evaluate(() => document.getElementById('match-exit-confirm').hidden);
  assert.equal(hidden, true);
});

Then("the second page's match exit overlay is not shown", async function () {
  const hidden = await this.pageB.evaluate(() => document.getElementById('match-exit-confirm').hidden);
  assert.equal(hidden, true);
});

Then('the second page is still in the match', async function () {
  const hidden = await this.pageB.evaluate(() => document.getElementById('match').hidden);
  assert.equal(hidden, false);
});

Then('the second page is back at the start screen', async function () {
  await this.pageB.waitForSelector('#start-screen:not([hidden])', { timeout: 3000 });
  const matchHidden = await this.pageB.evaluate(() => document.getElementById('match').hidden);
  assert.equal(matchHidden, true);
});

Then('the first page is still in the match', async function () {
  const hidden = await this.pageA.evaluate(() => document.getElementById('match').hidden);
  assert.equal(hidden, false);
});

Then("the second page's match timer reads 10:00 or just under, in the pixel font", async function () {
  const result = await this.pageB.evaluate(async () => {
    await document.fonts.ready;
    const el = document.getElementById('match-timer');
    return { text: el.textContent, fontFamily: getComputedStyle(el).fontFamily };
  });
  assert.ok(/^(10:00|9:5\d)$/.test(result.text), `expected a timer reading close to 10:00, got "${result.text}"`);
  assert.ok(result.fontFamily.includes('Press Start 2P'), `expected the pixel font, got "${result.fontFamily}"`);
});

Then("the second page's match gauge is evenly split at the start", async function () {
  const width = await this.pageB.evaluate(() => document.getElementById('match-gauge-fill').style.width);
  assert.equal(width, '50%');
});
