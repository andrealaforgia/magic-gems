import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMagicGems } from '../support/load-src.js';

const { multiplierFraction, multiplierBarColor } = loadMagicGems([
  new URL('../../src/multiplier-bar.js', import.meta.url),
]);

test('multiplierFraction is 1 at the maximum and 0 when empty (SPEC 10.8)', () => {
  assert.equal(multiplierFraction(5000, 5000), 1);
  assert.equal(multiplierFraction(0, 5000), 0);
});

test('multiplierFraction is proportional at an intermediate value', () => {
  assert.equal(multiplierFraction(2500, 5000), 0.5);
  assert.equal(multiplierFraction(1000, 5000), 0.2);
});

test('multiplierFraction clamps to [0, 1] for out-of-range input', () => {
  assert.equal(multiplierFraction(-10, 5000), 0);
  assert.equal(multiplierFraction(6000, 5000), 1);
});

test('multiplierBarColor is green when full and red when empty (SPEC 10.8)', () => {
  assert.equal(multiplierBarColor(1), 'hsl(120, 70%, 45%)');
  assert.equal(multiplierBarColor(0), 'hsl(0, 70%, 45%)');
});

test('multiplierBarColor passes through a visibly distinct intermediate hue, not a two-tone jump', () => {
  const full = multiplierBarColor(1);
  const mid = multiplierBarColor(0.5);
  const empty = multiplierBarColor(0);
  assert.notEqual(mid, full);
  assert.notEqual(mid, empty);
  assert.equal(mid, 'hsl(60, 70%, 45%)');
});

test('multiplierBarColor shifts smoothly (linearly) with fraction, not in fixed steps', () => {
  const hueOf = (fraction) => Number(multiplierBarColor(fraction).match(/hsl\((\d+(?:\.\d+)?),/)[1]);
  const hues = [0, 0.25, 0.5, 0.75, 1].map(hueOf);
  for (let i = 1; i < hues.length; i++) {
    assert.ok(hues[i] > hues[i - 1], 'expected hue to strictly increase as the fraction rises');
  }
  // Equal steps in fraction produce equal steps in hue - a linear, not stepped, shift.
  const deltas = hues.slice(1).map((h, i) => h - hues[i]);
  for (const delta of deltas) {
    assert.equal(delta, deltas[0]);
  }
});

test('multiplierBarColor clamps fraction to [0, 1]', () => {
  assert.equal(multiplierBarColor(-0.5), multiplierBarColor(0));
  assert.equal(multiplierBarColor(1.5), multiplierBarColor(1));
});
