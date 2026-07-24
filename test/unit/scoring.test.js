import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMagicGems } from '../support/load-src.js';

const {
  runBasePoints,
  summedBasePoints,
  TIME_MULTIPLIER_START,
  computeTimeMultiplier,
  comboFactorForChainIndex,
  computeCompletionScore,
} = loadMagicGems([new URL('../../src/scoring.js', import.meta.url)]);

test('runBasePoints follows (run length - 2) x 50 (SPEC 10.3)', () => {
  assert.equal(runBasePoints(3), 50);
  assert.equal(runBasePoints(4), 100);
  assert.equal(runBasePoints(5), 150);
});

test('summedBasePoints sums each run\'s own base points before any multiplier (SPEC 10.4)', () => {
  assert.equal(summedBasePoints([3]), 50);
  assert.equal(summedBasePoints([3, 4]), 150);
  assert.equal(summedBasePoints([]), 0);
});

test('TIME_MULTIPLIER_START is 5000 (SPEC 10.5)', () => {
  assert.equal(TIME_MULTIPLIER_START, 5000);
});

test('computeTimeMultiplier starts at 5000 with no elapsed time', () => {
  assert.equal(computeTimeMultiplier(0), 5000);
});

test('computeTimeMultiplier counts down by exactly 1 per whole elapsed second', () => {
  assert.equal(computeTimeMultiplier(30000), 4970);
  assert.equal(computeTimeMultiplier(1000), 4999);
});

test('computeTimeMultiplier only counts whole seconds, not partial ones', () => {
  assert.equal(computeTimeMultiplier(999), 5000);
  assert.equal(computeTimeMultiplier(1999), 4999);
});

test('computeTimeMultiplier never exceeds 5000, even for a slightly negative elapsed time', () => {
  // A tiny negative elapsed can arise from two clock readings taken microseconds
  // apart around a reset (never a real backward-in-time gap) - must clamp to 0
  // whole seconds, not let Math.floor's round-toward-negative-infinity turn -0.05
  // into -1 and inflate the multiplier past its own starting value.
  assert.equal(computeTimeMultiplier(-50), 5000);
  assert.equal(computeTimeMultiplier(-1), 5000);
});

test('computeTimeMultiplier never drops below 0', () => {
  assert.equal(computeTimeMultiplier(4999000), 1);
  assert.equal(computeTimeMultiplier(5000000), 0);
  assert.equal(computeTimeMultiplier(6000000), 0);
});

test('comboFactorForChainIndex follows 2^(k-1) for the k-th completion of a chain (SPEC 10.6)', () => {
  assert.equal(comboFactorForChainIndex(1), 1);
  assert.equal(comboFactorForChainIndex(2), 2);
  assert.equal(comboFactorForChainIndex(3), 4);
  assert.equal(comboFactorForChainIndex(4), 8);
});

test('computeCompletionScore reproduces the frozen worked example: a lone 3-run, 30s gap (SPEC 10.7.1)', () => {
  assert.equal(computeCompletionScore(50, 4970, 1), 2485);
});

test('computeCompletionScore reproduces the frozen worked example: a 3-run and 4-run together, 30s gap, first in chain (SPEC 10.7.1)', () => {
  assert.equal(computeCompletionScore(150, 4970, 1), 7455);
});

test('computeCompletionScore multiplies by the combo factor, never divides by it', () => {
  // With comboFactor=1 (every worked example above), multiplying and dividing by
  // it are indistinguishable - use comboFactor=2 so they diverge: multiplying
  // doubles the score (4970), dividing would roughly halve it (1242).
  assert.equal(computeCompletionScore(50, 4970, 2), 4970);
});

test('computeCompletionScore truncates (floors), never rounds', () => {
  // 50 * 99 * 1 / 100 = 49.5 - floor must give 49, not 50 (which a round-half-up
  // would produce), proving the formula truncates rather than rounds.
  assert.equal(computeCompletionScore(50, 99, 1), 49);
});
