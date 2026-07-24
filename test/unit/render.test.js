import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMagicGems } from '../support/load-src.js';

const {
  drawGem,
  drawBoard,
  drawInteraction,
  drawFragments,
  computeSpriteDrawRect,
  GEM_SPRITE_FIT_RATIO,
  HIGHLIGHT_COLORS,
  HIGHLIGHT_RING_INSET,
  FRAGMENT_SIZE,
} = loadMagicGems([
  new URL('../../src/sprite-layout.js', import.meta.url),
  new URL('../../src/render.js', import.meta.url),
]);

// A minimal ctx double: no real Canvas/DOM needed since render.js only ever calls a
// handful of CanvasRenderingContext2D methods/setters on whatever it's given.
function createCtxSpy() {
  const calls = [];
  const props = {};
  const ctx = {
    calls,
    save: (...a) => calls.push(['save', a]),
    restore: (...a) => calls.push(['restore', a]),
    clearRect: (...a) => calls.push(['clearRect', a]),
    drawImage: (...a) => calls.push(['drawImage', a]),
    fillRect: (...a) => calls.push(['fillRect', a]),
    strokeRect: (...a) => calls.push(['strokeRect', a]),
  };
  for (const prop of ['fillStyle', 'strokeStyle', 'lineWidth', 'shadowBlur', 'shadowColor']) {
    Object.defineProperty(ctx, prop, {
      get() {
        return props[prop];
      },
      set(value) {
        props[prop] = value;
        calls.push([`set:${prop}`, value]);
      },
    });
  }
  return ctx;
}

test('drawGem draws the gem sprite via drawImage, centred and scaled per computeSpriteDrawRect', () => {
  const ctx = createCtxSpy();
  const sprite = { naturalWidth: 50, naturalHeight: 40 };
  drawGem(ctx, 'red-square', 120, 80, 60, { 'red-square': [sprite] });

  const drawnSprite = ctx.calls.find((c) => c[0] === 'drawImage' && c[1][0] === sprite);
  assert.ok(drawnSprite, 'must draw the real sprite image, not a vector path');
  const [, x, y, width, height] = drawnSprite[1];

  const expected = computeSpriteDrawRect(50, 40, 120, 80, 60, GEM_SPRITE_FIT_RATIO);
  assert.equal(x, expected.x);
  assert.equal(y, expected.y);
  assert.equal(width, expected.width);
  assert.equal(height, expected.height);
});

test('drawGem defaults to the face-on frame (index 0) when no frame is requested', () => {
  const ctx = createCtxSpy();
  const faceOn = { naturalWidth: 50, naturalHeight: 50 };
  const otherFrame = { naturalWidth: 50, naturalHeight: 50 };
  drawGem(ctx, 'red-square', 0, 0, 60, { 'red-square': [faceOn, otherFrame] });

  const [img] = ctx.calls.find((c) => c[0] === 'drawImage')[1];
  assert.equal(img, faceOn);
});

test('drawGem draws whichever rotation frame is requested', () => {
  const ctx = createCtxSpy();
  const frames = Array.from({ length: 15 }, () => ({ naturalWidth: 50, naturalHeight: 50 }));
  drawGem(ctx, 'red-square', 0, 0, 60, { 'red-square': frames }, 7);

  const [img] = ctx.calls.find((c) => c[0] === 'drawImage')[1];
  assert.equal(img, frames[7]);
});

test('drawGem never applies a glow effect', () => {
  const ctx = createCtxSpy();
  drawGem(ctx, 'red-square', 0, 0, 60, { 'red-square': [{ naturalWidth: 50, naturalHeight: 50 }] });

  const nonZeroGlow = ctx.calls.filter((c) => c[0] === 'set:shadowBlur' && c[1] > 0);
  assert.equal(nonZeroGlow.length, 0, 'drawGem must never set a nonzero shadowBlur');
  const shadowColorSets = ctx.calls.filter((c) => c[0] === 'set:shadowColor');
  assert.equal(shadowColorSets.length, 0, 'drawGem must never set a shadowColor');
});

test('drawBoard clears the canvas, then draws every occupied cell and skips empty ones', () => {
  const ctx = createCtxSpy();
  const sprites = {
    'red-square': [{ naturalWidth: 50, naturalHeight: 50 }],
    'yellow-diamond': [{ naturalWidth: 50, naturalHeight: 50 }],
  };
  const board = [
    ['red-square', null],
    [null, 'yellow-diamond'],
  ];

  drawBoard(ctx, board, 40, sprites);

  const clearIndex = ctx.calls.findIndex((c) => c[0] === 'clearRect');
  const drawImageCalls = ctx.calls.filter((c) => c[0] === 'drawImage');
  const drawImageIndices = ctx.calls.reduce((acc, c, i) => (c[0] === 'drawImage' ? [...acc, i] : acc), []);
  assert.ok(clearIndex !== -1 && drawImageIndices.every((i) => i > clearIndex), 'must clear before drawing any gem');

  const drawnSprites = drawImageCalls.map((c) => c[1][0]);
  assert.equal(drawnSprites.length, 2, 'expected exactly the two occupied cells\' sprites to be drawn');
  assert.deepEqual(
    new Set(drawnSprites),
    new Set([sprites['red-square'][0], sprites['yellow-diamond'][0]]),
    'expected exactly the two occupied cells\' own sprites to be drawn, in any order'
  );
});

test('drawBoard clears exactly the board\'s own pixel dimensions', () => {
  const ctx = createCtxSpy();
  const sprites = { 'red-square': [{ naturalWidth: 50, naturalHeight: 50 }] };
  const board = [
    ['red-square', 'red-square'],
    ['red-square', 'red-square'],
  ];
  drawBoard(ctx, board, 40, sprites);
  const [[x, y, width, height]] = ctx.calls.filter((c) => c[0] === 'clearRect').map((c) => c[1]);
  assert.deepEqual([x, y, width, height], [0, 0, 2 * 40, 2 * 40]);
});

test('drawBoard centres each gem on its own cell, not a neighbour\'s', () => {
  const ctx = createCtxSpy();
  const sprite = { naturalWidth: 50, naturalHeight: 50 };
  const cellSize = 40;
  const board = [
    [null, null],
    [null, 'red-square'],
  ];
  drawBoard(ctx, board, cellSize, { 'red-square': [sprite] });
  const [[, x, y, width, height]] = ctx.calls.filter((c) => c[0] === 'drawImage').map((c) => c[1]);
  assert.equal(x + width / 2, 1 * cellSize + cellSize / 2, 'expected the gem centred on column 1');
  assert.equal(y + height / 2, 1 * cellSize + cellSize / 2, 'expected the gem centred on row 1');
});

test('drawBoard skips cells marked hidden', () => {
  const ctx = createCtxSpy();
  const sprites = { 'red-square': [{ naturalWidth: 50, naturalHeight: 50 }] };

  drawBoard(ctx, [['red-square']], 40, sprites, new Set(['0,0']));

  assert.equal(ctx.calls.filter((c) => c[0] === 'drawImage').length, 0);
});

test('drawBoard defaults every cell to the face-on frame when no frame lookup is given', () => {
  const ctx = createCtxSpy();
  const frames = Array.from({ length: 15 }, () => ({ naturalWidth: 50, naturalHeight: 50 }));
  drawBoard(ctx, [['red-square']], 40, { 'red-square': frames });
  const [img] = ctx.calls.find((c) => c[0] === 'drawImage')[1];
  assert.equal(img, frames[0]);
});

test('drawBoard asks its frame lookup for each cell\'s own (row, col) and draws that frame', () => {
  const ctx = createCtxSpy();
  const frames = Array.from({ length: 15 }, () => ({ naturalWidth: 50, naturalHeight: 50 }));
  const cellSize = 40;
  const board = [
    ['red-square', 'red-square'],
    ['red-square', 'red-square'],
  ];
  // Injective over this 2x2 board, so each cell gets a distinct frame - lets the
  // assertion below confirm the *correct* frame reached the *correct* cell, not
  // just that some expected set of frames was drawn somewhere.
  const frameIndexFor = (row, col) => row * 2 + col;

  drawBoard(ctx, board, cellSize, { 'red-square': frames }, undefined, frameIndexFor);

  const drawCalls = ctx.calls.filter((c) => c[0] === 'drawImage');
  assert.equal(drawCalls.length, 4, 'expected all four occupied cells to be drawn');
  for (const [sprite, x, y, width, height] of drawCalls.map((c) => c[1])) {
    // Recover which cell this draw call was for from the rect it actually drew,
    // rather than assuming iteration order.
    const col = Math.round((x + width / 2 - cellSize / 2) / cellSize);
    const row = Math.round((y + height / 2 - cellSize / 2) / cellSize);
    assert.equal(
      sprite,
      frames[frameIndexFor(row, col)],
      `expected cell (${row},${col}) to be drawn with the frame its own frame lookup returned`
    );
  }
});

test('drawInteraction draws only a cursor ring when there is no selection', () => {
  const ctx = createCtxSpy();
  drawInteraction(ctx, { cursor: { row: 1, col: 2 }, selection: null, target: null }, 40);
  assert.equal(ctx.calls.filter((c) => c[0] === 'strokeRect').length, 1);
});

test('drawInteraction draws both a selection ring and a target ring when a target is designated', () => {
  const ctx = createCtxSpy();
  drawInteraction(
    ctx,
    { cursor: { row: 0, col: 0 }, selection: { row: 1, col: 1 }, target: { row: 1, col: 2 } },
    40
  );
  assert.equal(ctx.calls.filter((c) => c[0] === 'strokeRect').length, 2);
});

test('drawInteraction draws only a selection ring when a selection exists but no target yet', () => {
  const ctx = createCtxSpy();
  drawInteraction(ctx, { cursor: { row: 0, col: 0 }, selection: { row: 1, col: 1 }, target: null }, 40);
  assert.equal(ctx.calls.filter((c) => c[0] === 'strokeRect').length, 1);
});

test('drawInteraction draws a highlight ring at the correct inset rect for its cell', () => {
  const ctx = createCtxSpy();
  const cellSize = 40;
  drawInteraction(ctx, { cursor: { row: 2, col: 3 }, selection: null, target: null }, cellSize);
  const [[x, y, width, height]] = ctx.calls.filter((c) => c[0] === 'strokeRect').map((c) => c[1]);
  assert.equal(x, 3 * cellSize + HIGHLIGHT_RING_INSET);
  assert.equal(y, 2 * cellSize + HIGHLIGHT_RING_INSET);
  assert.equal(width, cellSize - 2 * HIGHLIGHT_RING_INSET);
  assert.equal(height, cellSize - 2 * HIGHLIGHT_RING_INSET);
});

test('HIGHLIGHT_COLORS defines a distinct, non-empty colour for cursor, selection, and target', () => {
  const values = Object.values(HIGHLIGHT_COLORS);
  assert.equal(new Set(values).size, 3, 'expected three distinct highlight colours');
  for (const value of values) assert.ok(typeof value === 'string' && value.length > 0);
});

test('drawFragments draws one filled rect per fragment', () => {
  const ctx = createCtxSpy();
  drawFragments(ctx, [
    { x: 10, y: 20, color: '#fff' },
    { x: 30, y: 40, color: '#000' },
  ]);
  assert.equal(ctx.calls.filter((c) => c[0] === 'fillRect').length, 2);
});

test('drawFragments centres each fragment\'s rect on its own position', () => {
  const ctx = createCtxSpy();
  drawFragments(ctx, [{ x: 100, y: 200, color: '#fff' }]);
  const [[x, y, width, height]] = ctx.calls.filter((c) => c[0] === 'fillRect').map((c) => c[1]);
  assert.equal(x, 100 - FRAGMENT_SIZE / 2);
  assert.equal(y, 200 - FRAGMENT_SIZE / 2);
  assert.equal(width, FRAGMENT_SIZE);
  assert.equal(height, FRAGMENT_SIZE);
});
