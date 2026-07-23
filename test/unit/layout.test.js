import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMagicGems } from '../support/load-src.js';

const { computeCellSize } = loadMagicGems([
  new URL('../../src/layout.js', import.meta.url),
]);

const BOARD_SIZE = 8;

test('on a wide viewport, the board size is driven by 80% of viewport height', () => {
  const cellSize = computeCellSize(1600, 1000, BOARD_SIZE);
  assert.equal(cellSize, Math.floor((1000 * 0.8) / BOARD_SIZE));
});

test('on a narrow viewport, the board shrinks to fit the width instead of overflowing', () => {
  const cellSize = computeCellSize(400, 1000, BOARD_SIZE);
  assert.equal(cellSize, Math.floor(400 / BOARD_SIZE));
  assert.ok(cellSize * BOARD_SIZE <= 400, 'board must not overflow the viewport width');
});

test('cellSize is always a whole number of pixels', () => {
  const cellSize = computeCellSize(777, 951, BOARD_SIZE);
  assert.equal(Number.isInteger(cellSize), true);
});

test('a taller viewport at the same width yields a larger board, up to the width cap', () => {
  const small = computeCellSize(2000, 600, BOARD_SIZE);
  const large = computeCellSize(2000, 1200, BOARD_SIZE);
  assert.ok(large > small, 'a taller viewport should produce a larger board when width is not the limiting factor');
});
