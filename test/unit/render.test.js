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
  const frames = Array.from({ length: 15 }, () => ({ naturalWidth: 50, naturalHeight: 50 }));
  drawGem(ctx, 'red-square', 0, 0, 60, { 'red-square': frames });
  const [drawn] = ctx.calls.filter((c) => c[0] === 'drawImage').map((c) => c[1]);
  assert.equal(drawn[0], frames[0]);
});

test('drawGem draws whichever rotation frame is requested (SPEC 8.3.1)', () => {
  const ctx = createCtxSpy();
  const frames = Array.from({ length: 15 }, () => ({ naturalWidth: 50, naturalHeight: 50 }));
  drawGem(ctx, 'red-square', 0, 0, 60, { 'red-square': frames }, 7);
  const [drawn] = ctx.calls.filter((c) => c[0] === 'drawImage').map((c) => c[1]);
  assert.equal(drawn[0], frames[7]);
});

test('drawGem never applies a glow effect', () => {
  const ctx = createCtxSpy();
  drawGem(ctx, 'red-square', 0, 0, 60, { 'red-square': [{ naturalWidth: 50, naturalHeight: 50 }] });

  const nonZeroGlow = ctx.calls.filter((c) => c[0] === 'set:shadowBlur' && c[1] > 0);
  assert.equal(nonZeroGlow.length, 0, 'drawGem must never set a nonzero shadowBlur');
  const shadowColorSets = ctx.calls.filter((c) => c[0] === 'set:shadowColor');
  assert.equal(shadowColorSets.length, 0, 'drawGem must never set a shadowColor');
});

test('drawBoard paints cell backgrounds, then draws every occupied cell and skips empty ones', () => {
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

  const fillRectIndices = ctx.calls.reduce((acc, c, i) => (c[0] === 'fillRect' ? [...acc, i] : acc), []);
  const drawImageIndices = ctx.calls.reduce((acc, c, i) => (c[0] === 'drawImage' ? [...acc, i] : acc), []);
  assert.equal(fillRectIndices.length, 4, 'expected one background fill per cell, including empty ones');
  assert.ok(
    Math.max(...fillRectIndices) < Math.min(...drawImageIndices),
    'every cell background must paint before any gem is drawn on top of it'
  );

  const drawnSprites = drawImageIndices.map((i) => ctx.calls[i][1][0]);
  assert.equal(drawnSprites.length, 2, 'expected exactly the two occupied cells\' sprites to be drawn');
  assert.deepEqual(
    new Set(drawnSprites),
    new Set([sprites['red-square'][0], sprites['yellow-diamond'][0]]),
    'expected exactly the two occupied cells\' own sprites to be drawn, in any order'
  );
});

test('drawBoard\'s cell backgrounds together cover exactly the board\'s own pixel dimensions, no gaps or overlap', () => {
  const ctx = createCtxSpy();
  const sprites = { 'red-square': [{ naturalWidth: 50, naturalHeight: 50 }] };
  const cellSize = 40;
  const board = [
    ['red-square', 'red-square'],
    ['red-square', 'red-square'],
  ];
  drawBoard(ctx, board, cellSize, sprites);

  const rects = ctx.calls.filter((c) => c[0] === 'fillRect').map((c) => c[1]);
  assert.equal(rects.length, 4);
  const totalArea = rects.reduce((sum, [, , w, h]) => sum + w * h, 0);
  assert.equal(totalArea, 2 * cellSize * (2 * cellSize));
  const uniqueOrigins = new Set(rects.map(([x, y]) => `${x},${y}`));
  assert.equal(uniqueOrigins.size, 4, 'expected each cell to get its own distinct background rect');
});

test('drawBoard paints the even-parity (0,0) cell dark and its odd-parity neighbour (0,1) light', () => {
  const ctx = createCtxSpy();
  const sprites = { 'red-square': [{ naturalWidth: 50, naturalHeight: 50 }] };
  const cellSize = 40;
  const board = [
    ['red-square', 'red-square'],
    ['red-square', 'red-square'],
  ];
  drawBoard(ctx, board, cellSize, sprites);

  const shadeAt = {};
  let pendingFillStyle = null;
  for (const call of ctx.calls) {
    if (call[0] === 'set:fillStyle') pendingFillStyle = call[1];
    if (call[0] === 'fillRect') {
      const [x, y] = call[1];
      shadeAt[`${y / cellSize},${x / cellSize}`] = pendingFillStyle;
    }
  }

  // Pinned to the actual shipped hex values (a builder-chosen aesthetic, not a
  // SPEC-given one) so a swapped even/odd assignment or an emptied colour
  // constant both fail here, not just "some two distinct values were used".
  assert.equal(shadeAt['0,0'], '#1a1a1a');
  assert.equal(shadeAt['0,1'], '#242424');
});

test('drawBoard alternates cell background shade so no two orthogonal neighbours share a shade (SPEC 3.5)', () => {
  const ctx = createCtxSpy();
  const sprites = { 'red-square': [{ naturalWidth: 50, naturalHeight: 50 }] };
  const cellSize = 40;
  const size = 4;
  const board = Array.from({ length: size }, () => Array.from({ length: size }, () => 'red-square'));
  drawBoard(ctx, board, cellSize, sprites);

  // Recover each cell's own fillStyle from whichever value was set immediately
  // before its fillRect - every fillRect here is a background paint (gems use
  // drawImage), so this pairs each shade with the cell it was painted for.
  const shadeAt = {};
  let pendingFillStyle = null;
  for (const call of ctx.calls) {
    if (call[0] === 'set:fillStyle') pendingFillStyle = call[1];
    if (call[0] === 'fillRect') {
      const [x, y] = call[1];
      shadeAt[`${y / cellSize},${x / cellSize}`] = pendingFillStyle;
    }
  }

  assert.equal(new Set(Object.values(shadeAt)).size, 2, 'expected exactly two distinct background shades');
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (col + 1 < size) {
        assert.notEqual(
          shadeAt[`${row},${col}`],
          shadeAt[`${row},${col + 1}`],
          `expected (${row},${col}) and (${row},${col + 1}) to differ`
        );
      }
      if (row + 1 < size) {
        assert.notEqual(
          shadeAt[`${row},${col}`],
          shadeAt[`${row + 1},${col}`],
          `expected (${row},${col}) and (${row + 1},${col}) to differ`
        );
      }
    }
  }
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

test('drawBoard still paints a cell\'s background even when its gem is hidden (SPEC 3.5)', () => {
  const ctx = createCtxSpy();
  const sprites = { 'red-square': [{ naturalWidth: 50, naturalHeight: 50 }] };

  drawBoard(ctx, [['red-square']], 40, sprites, new Set(['0,0']));

  assert.equal(ctx.calls.filter((c) => c[0] === 'fillRect').length, 1, 'the cell\'s background must still be painted');
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

test('drawFragments draws one sprite-slice image per fragment, not a flat fill', () => {
  const ctx = createCtxSpy();
  const spriteA = { naturalWidth: 50, naturalHeight: 50 };
  const spriteB = { naturalWidth: 50, naturalHeight: 50 };
  drawFragments(ctx, [
    { x: 10, y: 20, sprite: spriteA, sx: 0, sy: 0, sw: 12, sh: 25 },
    { x: 30, y: 40, sprite: spriteB, sx: 12, sy: 0, sw: 12, sh: 25 },
  ]);
  const drawImageCalls = ctx.calls.filter((c) => c[0] === 'drawImage');
  assert.equal(drawImageCalls.length, 2);
  assert.deepEqual(new Set(drawImageCalls.map((c) => c[1][0])), new Set([spriteA, spriteB]));
  assert.equal(ctx.calls.filter((c) => c[0] === 'fillRect').length, 0, 'must not fall back to a flat fill');
});

test('drawFragments crops the fragment\'s own source tile and centres it on its own position', () => {
  const ctx = createCtxSpy();
  const sprite = { naturalWidth: 50, naturalHeight: 50 };
  drawFragments(ctx, [{ x: 100, y: 200, sprite, sx: 5, sy: 7, sw: 12, sh: 25 }]);

  const [drawn] = ctx.calls.filter((c) => c[0] === 'drawImage').map((c) => c[1]);
  const [img, sx, sy, sw, sh, dx, dy, dw, dh] = drawn;
  assert.equal(img, sprite);
  assert.deepEqual([sx, sy, sw, sh], [5, 7, 12, 25], 'must crop exactly the fragment\'s own source tile, not the whole sprite');
  assert.equal(dx + dw / 2, 100, 'expected the drawn slice centred on the fragment\'s x position');
  assert.equal(dy + dh / 2, 200, 'expected the drawn slice centred on the fragment\'s y position');
});
