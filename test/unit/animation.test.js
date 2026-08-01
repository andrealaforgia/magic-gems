import { test } from 'node:test';
import assert from 'node:assert';
import { loadMagicGems } from '../support/load-src.js';

const { clampProgress, lerp, interpolatePoint } = loadMagicGems([
  new URL('../../src/animation.js', import.meta.url),
]);

test('clampProgress is 0 at the start of the duration', () => {
  assert.equal(clampProgress(0, 300), 0);
});

test('clampProgress is 1 once elapsed time reaches the duration', () => {
  assert.equal(clampProgress(300, 300), 1);
});

test('clampProgress is the exact fraction partway through the duration', () => {
  assert.equal(clampProgress(150, 300), 0.5);
});

test('clampProgress never exceeds 1 once elapsed time overshoots the duration', () => {
  assert.equal(clampProgress(400, 300), 1);
});

test('clampProgress never goes below 0 for a negative elapsed time', () => {
  assert.equal(clampProgress(-50, 300), 0);
});

test('clampProgress treats a zero-or-negative duration as already complete', () => {
  assert.equal(clampProgress(0, 0), 1);
  assert.equal(clampProgress(10, -5), 1);
});

test('lerp returns the start value at progress 0', () => {
  assert.equal(lerp(10, 50, 0), 10);
});

test('lerp returns the end value at progress 1', () => {
  assert.equal(lerp(10, 50, 1), 50);
});

test('lerp returns the exact midpoint at progress 0.5', () => {
  assert.equal(lerp(10, 50, 0.5), 30);
});

test('lerp works with a decreasing range', () => {
  assert.equal(lerp(50, 10, 0.25), 40);
});

test('interpolatePoint lerps both x and y independently', () => {
  const point = interpolatePoint(0, 100, 40, 0, 0.25);
  assert.equal(point.x, 10);
  assert.equal(point.y, 75);
});
