import { Given, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

function readScore(page) {
  return page.evaluate(() => Number(document.getElementById('score').textContent.replace('Score: ', '')));
}

// The bar's real display is its fill width/colour (SPEC 10.8); this reads the
// precise underlying value from the same data attribute main.js stamps alongside
// them, rather than recovering it from a CSS percentage (lossy) or a colour.
function readMultiplierValue(page) {
  return page.evaluate(() => Number(document.getElementById('multiplier-fill').dataset.multiplier));
}

// Injects a single shared board-builder into the page once per scenario (idempotent
// - later calls are a no-op), rather than repeating the same board-construction
// block inside every step's own page.evaluate. Runs are carved into the same
// match-free diagonal pattern this project's own unit tests use (verified, the same
// way test/unit/resolution.test.js's own fixtures are, not to accidentally extend
// via GEM_TYPES.length's own wraparound).
async function ensureBoardBuilder(page) {
  await page.evaluate(() => {
    if (window.__buildBoardWithRuns) return;
    window.__buildBoardWithRuns = function (runs) {
      const { GEM_TYPES } = window.MagicGems;
      const size = 8;
      const board = Array.from({ length: size }, (_, row) =>
        Array.from({ length: size }, (_, col) => GEM_TYPES[(row + col) % GEM_TYPES.length])
      );
      for (const { row, startCol, length, valueIndex } of runs) {
        for (let col = startCol; col < startCol + length; col++) {
          board[row][col] = GEM_TYPES[valueIndex];
        }
      }
      return board;
    };
  });
}

const LONE_RUN_SPEC = (length) => [{ row: 0, startCol: 2, length, valueIndex: 2 }];
const TWO_RUN_SPEC = (lengthA, lengthB) => [
  { row: 0, startCol: 2, length: lengthA, valueIndex: 2 },
  { row: 6, startCol: 0, length: lengthB, valueIndex: 1 },
];

Then('the score reads exactly {int}', async function (expected) {
  assert.equal(await readScore(this.page), expected);
});

Then('the score is displayed and reads exactly 0', async function () {
  assert.equal(await readScore(this.page), 0);
});

Then('the time multiplier bar is displayed and is full, at exactly 300', async function () {
  assert.equal(await readMultiplierValue(this.page), 300);
});

Given('I record the current score', async function () {
  this.recordedScore = await readScore(this.page);
});

Then('the score has not decreased since it was recorded', async function () {
  const current = await readScore(this.page);
  assert.ok(current >= this.recordedScore, `expected the score to never decrease: was ${this.recordedScore}, now ${current}`);
  this.recordedScore = current;
});

Then('the score has strictly increased since it was recorded', async function () {
  const current = await readScore(this.page);
  assert.ok(current > this.recordedScore, `expected the score to increase from ${this.recordedScore}, but it is still ${current}`);
});

// Checked at the moment the score itself changes (proof a completion just fired),
// not after waiting for the shatter animation to fully settle - fragments can take
// well over a real second to fall off-screen, by which point the multiplier has
// legitimately already ticked down from its just-reset value (SPEC 10.5). Requires
// "I record the current score" beforehand so there's a prior value to compare against.
Then('the time multiplier bar reset to full, exactly 300, at the moment of that commit\'s completion', async function () {
  assert.ok(this.recordedScore !== undefined, 'expected a previously recorded score to compare against');
  await this.page.waitForFunction(
    (scoreBefore) => Number(document.getElementById('score').textContent.replace('Score: ', '')) !== scoreBefore,
    this.recordedScore,
    { timeout: 3000 }
  );
  const multiplier = await readMultiplierValue(this.page);
  assert.equal(multiplier, 300, `expected the multiplier to read exactly 300 right at the completion, got ${multiplier}`);
});

// Verifies the base-points-per-run-length claim (SPEC 10.3/10.4) using the live
// page's own unmodified resolveCascade/scoring functions - a real, executed call
// against production code, not a re-derivation of the formula.
Then('a real completion of a {int}-run on the live page contributes exactly {int} base points before any multiplier', async function (length, expectedBase) {
  await ensureBoardBuilder(this.page);
  const result = await this.page.evaluate((runs) => {
    const { resolveCascade, summedBasePoints } = window.MagicGems;
    const board = window.__buildBoardWithRuns(runs);
    const { steps } = resolveCascade(board);
    return { runLengths: steps[0].runLengths, base: summedBasePoints(steps[0].runLengths) };
  }, LONE_RUN_SPEC(length));

  assert.deepEqual(result.runLengths, [length], `expected a single run of length ${length}, got ${JSON.stringify(result.runLengths)}`);
  assert.equal(result.base, expectedBase);
});

// SPEC 10.4: two runs clearing in the same completion sum their base points before
// any multiplier - proven directly against the live page's own resolveCascade, not
// treated as two separate completions.
Then('a real completion clearing a {int}-run and a {int}-run together on the live page sums to exactly {int} base points', async function (lengthA, lengthB, expectedBase) {
  await ensureBoardBuilder(this.page);
  const result = await this.page.evaluate((runs) => {
    const { resolveCascade, summedBasePoints } = window.MagicGems;
    const board = window.__buildBoardWithRuns(runs);
    const { steps } = resolveCascade(board);
    return { stepCount: steps.length, runLengths: steps[0].runLengths, base: summedBasePoints(steps[0].runLengths) };
  }, TWO_RUN_SPEC(lengthA, lengthB));

  assert.equal(result.stepCount, 1, 'both runs must clear together in a single completion, not two separate ones');
  assert.deepEqual([...result.runLengths].sort(), [lengthA, lengthB].sort());
  assert.equal(result.base, expectedBase);
});

// SPEC 10.7.1: the two frozen worked examples, reproduced exactly through the live
// page's own real resolveCascade + scoring functions (not a re-implementation).
Then('the live page reproduces the frozen worked example: a lone {int}-run, {int}s gap, scores exactly {int}', async function (length, gapSeconds, expectedScore) {
  await ensureBoardBuilder(this.page);
  const result = await this.page.evaluate(({ runs, gapSeconds }) => {
    const { resolveCascade, summedBasePoints, computeTimeMultiplier, comboFactorForChainIndex, computeCompletionScore } = window.MagicGems;
    const board = window.__buildBoardWithRuns(runs);
    const { steps } = resolveCascade(board);
    const base = summedBasePoints(steps[0].runLengths);
    const timeMultiplier = computeTimeMultiplier(gapSeconds * 1000);
    return computeCompletionScore(base, timeMultiplier, comboFactorForChainIndex(1));
  }, { runs: LONE_RUN_SPEC(length), gapSeconds });

  assert.equal(result, expectedScore);
});

Then('the live page reproduces the frozen worked example: a {int}-run and {int}-run together, {int}s gap, first in chain, scores exactly {int}', async function (lengthA, lengthB, gapSeconds, expectedScore) {
  await ensureBoardBuilder(this.page);
  const result = await this.page.evaluate(({ runs, gapSeconds }) => {
    const { resolveCascade, summedBasePoints, computeTimeMultiplier, comboFactorForChainIndex, computeCompletionScore } = window.MagicGems;
    const board = window.__buildBoardWithRuns(runs);
    const { steps } = resolveCascade(board);
    const base = summedBasePoints(steps[0].runLengths);
    const timeMultiplier = computeTimeMultiplier(gapSeconds * 1000);
    return computeCompletionScore(base, timeMultiplier, comboFactorForChainIndex(1));
  }, { runs: TWO_RUN_SPEC(lengthA, lengthB), gapSeconds });

  assert.equal(result, expectedScore);
});

// SPEC 10.5/10.6: the pure timing/combo formulas themselves, called live on the
// real page (not re-implemented in the test).
Then('the live page\'s time multiplier for a {int}s gap reads exactly {int}', async function (gapSeconds, expected) {
  const result = await this.page.evaluate(
    ({ gapSeconds }) => window.MagicGems.computeTimeMultiplier(gapSeconds * 1000),
    { gapSeconds }
  );
  assert.equal(result, expected);
});

Then('the live page\'s combo factor for chain position {int} reads exactly {int}', async function (chainIndex, expected) {
  const result = await this.page.evaluate(
    ({ chainIndex }) => window.MagicGems.comboFactorForChainIndex(chainIndex),
    { chainIndex }
  );
  assert.equal(result, expected);
});

// Uses a real wait, deliberately, not Playwright's fake clock: installing
// page.clock on this page *after* it's already booted (main.js has already
// captured real performance.now() values into lastCompletionTimeMs) produces
// inconsistent results across runs (verified empirically: the same
// install()+fastForward(1100) sequence read back x4999 on one run and x5000 on
// the next, with no code change in between) - almost certainly the fake clock's
// own epoch not lining up with whatever real performance.now() reading main.js
// already has stored. A flaky-but-fast check is a worse trade than a slow-but-
// reliable one; this stays on a real wait until there's a way to install the fake
// clock *before* the page's own timing state exists (e.g. before navigation).
function readMultiplierFillWidth(page) {
  return page.evaluate(() => document.getElementById('multiplier-fill').getBoundingClientRect().width);
}

// Also covers DISPLAY-POLISH's E2 (the bar's fill width visibly shrinks over the
// same real interval, SPEC 10.8) at this one already-justified wait point, rather
// than a second independent sleep asserting the same underlying time-driven claim
// on a different surface (QA warning, commit 3c8f3b5) - the bar's proportionality
// to the multiplier value is separately proven sleep-free by display-polish's own
// @component scenario.
Then('the time multiplier reads lower after a short real interval, live and continuously', async function () {
  const before = { value: await readMultiplierValue(this.page), width: await readMultiplierFillWidth(this.page) };
  await this.page.waitForTimeout(1100);
  const after = { value: await readMultiplierValue(this.page), width: await readMultiplierFillWidth(this.page) };
  assert.ok(after.value < before.value, `expected the multiplier to visibly count down over ~1s, was ${before.value}, still ${after.value}`);
  assert.ok(after.width < before.width, `expected the bar's fill width to visibly shrink over ~1s, was ${before.width}px, still ${after.width}px`);
});
