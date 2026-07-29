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

// MP-SYNC-SEQUENCED root-cause: #match becomes visible as soon as the lobby
// hands off to the match view, but that client's own match accessors
// (getMatchScore, getMatchBoard, isMatchAutoplayOn, ...) aren't registered
// until AFTER that client's own async sprite load resolves - a real gap, not
// a flake, that only got wide enough to observe reliably under load. Waiting
// on visibility alone let a caller reach for those accessors before they
// existed; waiting on one of them directly (any registered together) is the
// actual readiness signal every other step in this suite depends on.
Then('the match begins on both pages', async function () {
  await this.pageA.waitForSelector('#match:not([hidden])', { timeout: 3000 });
  await this.pageB.waitForSelector('#match:not([hidden])', { timeout: 3000 });
  await this.pageA.waitForFunction(() => typeof window.MagicGems.getMatchScore === 'function', null, { timeout: 5000 });
  await this.pageB.waitForFunction(() => typeof window.MagicGems.getMatchScore === 'function', null, { timeout: 5000 });
});

Then('both pages show byte-for-byte identical starting boards', async function () {
  const boardA = await this.pageA.evaluate(() => window.MagicGems.getMatchBoard());
  const boardB = await this.pageB.evaluate(() => window.MagicGems.getMatchBoard());
  assert.deepEqual(boardA, boardB);
});

Then(
  "the first page's match shows {string} as the local player with a score, and {string} as the remote player",
  async function (localName, remoteName) {
    const result = await this.pageA.evaluate(() => ({
      localName: document.getElementById('match-local-name').textContent,
      remoteName: document.getElementById('match-remote-name').textContent,
      score: document.getElementById('match-local-score').textContent,
    }));
    assert.equal(result.localName, localName);
    assert.equal(result.remoteName, remoteName);
    assert.ok(/score/i.test(result.score), `expected a score display, got "${result.score}"`);
  }
);

Then("the first page's match timer reads 10:00 or just under, in the pixel font", async function () {
  const result = await this.pageA.evaluate(async () => {
    await document.fonts.ready;
    const el = document.getElementById('match-timer');
    return {
      text: el.textContent,
      fontFamily: getComputedStyle(el).fontFamily,
      pixelFontLoaded: [...document.fonts].some((f) => f.family === 'Press Start 2P' && f.status === 'loaded'),
    };
  });
  assert.ok(/^(10:00|9:5\d)$/.test(result.text), `expected a timer reading close to 10:00, got "${result.text}"`);
  assert.ok(result.fontFamily.includes('Press Start 2P'), `expected the pixel font, got "${result.fontFamily}"`);
  assert.ok(result.pixelFontLoaded, 'expected the "Press Start 2P" font to have actually loaded');
});

// QA review (commit 0a86908): the width-only check left 13.3.3.1 (remote
// portion also completing the bar), 13.3.3.3 (a permanent, centred halfway
// mark), and 13.3.3.5 (neither leading class at an exact 0-0 tie) entirely
// uncovered.
Then("the first page's match gauge is evenly split at the start", async function () {
  const state = await this.pageA.evaluate(() => {
    const gauge = document.getElementById('match-gauge');
    const gaugeRect = gauge.getBoundingClientRect();
    const midpoint = document.querySelector('.match-gauge-midpoint');
    const midpointRect = midpoint ? midpoint.getBoundingClientRect() : null;
    return {
      localWidth: document.getElementById('match-gauge-local').style.width,
      remoteWidth: document.getElementById('match-gauge-remote').style.width,
      isLocalLeading: gauge.classList.contains('is-local-leading'),
      isRemoteLeading: gauge.classList.contains('is-remote-leading'),
      midpointExists: !!midpoint,
      midpointCenterX: midpointRect ? midpointRect.left + midpointRect.width / 2 : null,
      gaugeCenterX: gaugeRect.left + gaugeRect.width / 2,
    };
  });
  assert.equal(state.localWidth, '50%');
  assert.equal(state.remoteWidth, '50%', 'expected the remote portion to also be 50%, summing to a full bar');
  assert.equal(state.isLocalLeading, false, 'expected no leading class on either side at a 0-0 tie');
  assert.equal(state.isRemoteLeading, false, 'expected no leading class on either side at a 0-0 tie');
  assert.ok(state.midpointExists, 'expected a permanent halfway-mark element');
  assert.ok(
    Math.abs(state.midpointCenterX - state.gaugeCenterX) < 1,
    `expected the halfway mark centred in the gauge, got midpoint=${state.midpointCenterX} gaugeCenter=${state.gaugeCenterX}`
  );
});

Then('the match timer on the first page visibly counts down over real time', async function () {
  const before = await this.pageA.textContent('#match-timer');
  await this.pageA.waitForTimeout(1500);
  const after = await this.pageA.textContent('#match-timer');
  assert.notEqual(before, after, `expected the timer to visibly change, stayed at "${before}"`);
});

Given("I locate an adjacent swap that would produce a match on the first page's local match board", async function () {
  const grid = await this.pageA.evaluate(() => window.MagicGems.getMatchBoard());
  this.matchFoundSwap = findAdjacentSwap(grid, true);
});

When("I commit that swap on the first page's local match board", async function () {
  const { a, b } = this.matchFoundSwap;
  const { cursor } = await this.pageA.evaluate(() => window.MagicGems.getMatchInteractionState());

  await moveCursorTo(this.pageA, cursor, a);
  await this.pageA.keyboard.press(' ');
  await this.pageA.keyboard.press(directionKey(a, b));
  await this.pageA.keyboard.press(' ');
});

Then("the first page's local match score has increased", async function () {
  await this.pageA.waitForFunction(() => window.MagicGems.getMatchScore() > 0, null, { timeout: 5000 });
  const score = await this.pageA.evaluate(() => window.MagicGems.getMatchScore());
  assert.ok(score > 0, `expected a positive score, got ${score}`);
});
