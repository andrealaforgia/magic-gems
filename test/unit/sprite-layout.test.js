import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMagicGems } from '../support/load-src.js';

const { computeSpriteDrawRect, GEM_SPRITE_FIT_RATIO } = loadMagicGems([
  new URL('../../src/sprite-layout.js', import.meta.url),
]);

test('the draw rect is centred on both axes around the given cell centre', () => {
  const rect = computeSpriteDrawRect(50, 50, 100, 140, 80, 0.86);
  assert.equal(rect.x + rect.width / 2, 100);
  assert.equal(rect.y + rect.height / 2, 140);
});

test('the draw rect stays centred for a non-square sprite image', () => {
  const rect = computeSpriteDrawRect(55, 54, 200, 200, 80, 0.86);
  assert.equal(rect.x + rect.width / 2, 200);
  assert.equal(rect.y + rect.height / 2, 200);
});

test('the draw rect preserves the sprite image aspect ratio', () => {
  const rect = computeSpriteDrawRect(55, 50, 0, 0, 80, 0.86);
  assert.equal(Math.round((rect.width / rect.height) * 1000), Math.round((55 / 50) * 1000));
});

test('the draw rect grows proportionally as cellSize grows, aspect preserved', () => {
  const small = computeSpriteDrawRect(50, 50, 0, 0, 40, 0.86);
  const big = computeSpriteDrawRect(50, 50, 0, 0, 80, 0.86);
  assert.equal(big.width, small.width * 2);
  assert.equal(big.height, small.height * 2);
});

test('the draw rect fits within the fitRatio fraction of the cell for a square sprite', () => {
  const cellSize = 80;
  const fitRatio = 0.86;
  const rect = computeSpriteDrawRect(50, 50, 0, 0, cellSize, fitRatio);
  assert.equal(rect.width, cellSize * fitRatio);
  assert.equal(rect.height, cellSize * fitRatio);
});

test('the draw rect never exceeds the fitRatio box on its longer side for a landscape sprite', () => {
  const cellSize = 80;
  const fitRatio = 0.86;
  const rect = computeSpriteDrawRect(55, 40, 0, 0, cellSize, fitRatio);
  assert.ok(rect.width <= cellSize * fitRatio + 1e-9);
  assert.ok(rect.height <= cellSize * fitRatio + 1e-9);
  assert.equal(rect.width, cellSize * fitRatio, 'the longer side (width) should exactly reach the fit box');
});

test('the draw rect is constrained by height, not width, for a portrait sprite', () => {
  const cellSize = 80;
  const fitRatio = 0.86;
  const rect = computeSpriteDrawRect(40, 55, 0, 0, cellSize, fitRatio);
  assert.ok(rect.width <= cellSize * fitRatio + 1e-9);
  assert.ok(rect.height <= cellSize * fitRatio + 1e-9);
  assert.equal(rect.height, cellSize * fitRatio, 'the longer side (height) should exactly reach the fit box');
});

test('GEM_SPRITE_FIT_RATIO is a sensible fraction between 0 and 1', () => {
  assert.ok(GEM_SPRITE_FIT_RATIO > 0 && GEM_SPRITE_FIT_RATIO <= 1);
});
