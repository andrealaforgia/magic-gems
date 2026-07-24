import { Given, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

function readScore(page) {
  return page.evaluate(() => Number(document.getElementById('score').textContent.replace('Score: ', '')));
}

function readMultiplierValue(page) {
  return page.evaluate(() => Number(document.getElementById('multiplier').textContent.replace('x', '')));
}

Then('the score reads exactly {int}', async function (expected) {
  assert.equal(await readScore(this.page), expected);
});

Then('the score is displayed and reads exactly 0', async function () {
  assert.equal(await readScore(this.page), 0);
});

Then('the time multiplier is displayed and reads exactly x5000', async function () {
  assert.equal(await readMultiplierValue(this.page), 5000);
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
Then('the time multiplier reset to x5000 at the moment of that commit\'s completion', async function () {
  assert.ok(this.recordedScore !== undefined, 'expected a previously recorded score to compare against');
  await this.page.waitForFunction(
    (scoreBefore) => Number(document.getElementById('score').textContent.replace('Score: ', '')) !== scoreBefore,
    this.recordedScore,
    { timeout: 3000 }
  );
  const multiplier = await readMultiplierValue(this.page);
  assert.equal(multiplier, 5000, `expected the multiplier to read exactly 5000 right at the completion, got ${multiplier}`);
});

// Verifies the base-points-per-run-length claim (SPEC 10.3/10.4) using the live
// page's own unmodified resolveCascade/scoring functions - a real, executed call
// against production code, not a re-derivation of the formula. Boards are built
// from the same match-free diagonal pattern this project's own unit tests use, with
// a run of the requested length carved in (verified not to accidentally extend, the
// same way test/unit/resolution.test.js's own fixtures are).
Then('a real completion of a {int}-run on the live page contributes exactly {int} base points before any multiplier', async function (length, expectedBase) {
  const result = await this.page.evaluate(({ length }) => {
    const { GEM_TYPES, resolveCascade, summedBasePoints } = window.MagicGems;
    const size = 8;
    const board = Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, col) => GEM_TYPES[(row + col) % GEM_TYPES.length])
    );
    for (let col = 2; col < 2 + length; col++) board[0][col] = GEM_TYPES[2];
    const { steps } = resolveCascade(board);
    return { runLengths: steps[0].runLengths, base: summedBasePoints(steps[0].runLengths) };
  }, { length });

  assert.deepEqual(result.runLengths, [length], `expected a single run of length ${length}, got ${JSON.stringify(result.runLengths)}`);
  assert.equal(result.base, expectedBase);
});

// SPEC 10.4: two runs clearing in the same completion sum their base points before
// any multiplier - proven directly against the live page's own resolveCascade, not
// treated as two separate completions.
Then('a real completion clearing a {int}-run and a {int}-run together on the live page sums to exactly {int} base points', async function (lengthA, lengthB, expectedBase) {
  const result = await this.page.evaluate(({ lengthA, lengthB }) => {
    const { GEM_TYPES, resolveCascade, summedBasePoints } = window.MagicGems;
    const size = 8;
    const board = Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, col) => GEM_TYPES[(row + col) % GEM_TYPES.length])
    );
    for (let col = 2; col < 2 + lengthA; col++) board[0][col] = GEM_TYPES[2];
    for (let col = 0; col < lengthB; col++) board[6][col] = GEM_TYPES[1];
    const { steps } = resolveCascade(board);
    return { stepCount: steps.length, runLengths: steps[0].runLengths, base: summedBasePoints(steps[0].runLengths) };
  }, { lengthA, lengthB });

  assert.equal(result.stepCount, 1, 'both runs must clear together in a single completion, not two separate ones');
  assert.deepEqual([...result.runLengths].sort(), [lengthA, lengthB].sort());
  assert.equal(result.base, expectedBase);
});

// SPEC 10.7.1: the two frozen worked examples, reproduced exactly through the live
// page's own real resolveCascade + scoring functions (not a re-implementation).
Then('the live page reproduces the frozen worked example: a lone {int}-run, {int}s gap, scores exactly {int}', async function (length, gapSeconds, expectedScore) {
  const result = await this.page.evaluate(({ length, gapSeconds }) => {
    const { GEM_TYPES, resolveCascade, summedBasePoints, computeTimeMultiplier, comboFactorForChainIndex, computeCompletionScore } = window.MagicGems;
    const size = 8;
    const board = Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, col) => GEM_TYPES[(row + col) % GEM_TYPES.length])
    );
    for (let col = 2; col < 2 + length; col++) board[0][col] = GEM_TYPES[2];
    const { steps } = resolveCascade(board);
    const base = summedBasePoints(steps[0].runLengths);
    const timeMultiplier = computeTimeMultiplier(gapSeconds * 1000);
    return computeCompletionScore(base, timeMultiplier, comboFactorForChainIndex(1));
  }, { length, gapSeconds });

  assert.equal(result, expectedScore);
});

Then('the live page reproduces the frozen worked example: a {int}-run and {int}-run together, {int}s gap, first in chain, scores exactly {int}', async function (lengthA, lengthB, gapSeconds, expectedScore) {
  const result = await this.page.evaluate(({ lengthA, lengthB, gapSeconds }) => {
    const { GEM_TYPES, resolveCascade, summedBasePoints, computeTimeMultiplier, comboFactorForChainIndex, computeCompletionScore } = window.MagicGems;
    const size = 8;
    const board = Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, col) => GEM_TYPES[(row + col) % GEM_TYPES.length])
    );
    for (let col = 2; col < 2 + lengthA; col++) board[0][col] = GEM_TYPES[2];
    for (let col = 0; col < lengthB; col++) board[6][col] = GEM_TYPES[1];
    const { steps } = resolveCascade(board);
    const base = summedBasePoints(steps[0].runLengths);
    const timeMultiplier = computeTimeMultiplier(gapSeconds * 1000);
    return computeCompletionScore(base, timeMultiplier, comboFactorForChainIndex(1));
  }, { lengthA, lengthB, gapSeconds });

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

Then('the time multiplier reads lower after a short real interval, live and continuously', async function () {
  const before = await readMultiplierValue(this.page);
  await this.page.waitForTimeout(1100);
  const after = await readMultiplierValue(this.page);
  assert.ok(after < before, `expected the multiplier to visibly count down over ~1s, was ${before}, still ${after}`);
});
