import { test } from 'node:test';
import assert from 'node:assert';
import { loadMagicGems } from '../support/load-src.js';

const { clampProgress, lerp, interpolatePoint } = loadMagicGems([
  new URL('../../src/animation.js', import.meta.url),
]);

const { buildQueue } = loadMagicGems([
  new URL('../../src/gems.js', import.meta.url),
  new URL('../../src/board.js', import.meta.url),
  new URL('../../src/resolution.js', import.meta.url),
  new URL('../../src/animation.js', import.meta.url),
]);

function revivedCommitResult() {
  return {
    swapAnimation: {
      a: { row: 0, col: 0 },
      b: { row: 0, col: 1 },
      preSwapBoard: [
        ['a', 'b'],
        ['c', 'd'],
      ],
      matched: true,
    },
    steps: [
      { boardBeforeStep: [], clearEvents: [], fallEvents: [], refillEvents: [], runLengths: [3] },
      { boardBeforeStep: [], clearEvents: [], fallEvents: [], refillEvents: [], runLengths: [3] },
    ],
    revived: true,
    board: [
      ['x', 'y'],
      ['z', 'w'],
    ],
    changedCells: [{ row: 1, col: 1, gemType: 'w' }],
    rotatingCells: [{ row: 1, col: 0 }, { row: 1, col: 1 }],
  };
}

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

// AUTOPLAY-INVALID-MOVE defect TWO (examiner-verified via direct code
// reading): the revive phase used to be queued AFTER the swap phase and
// every cascade step, so its rotation only started once the whole rest of
// the commit had already played out - hundreds of ms to seconds after the
// logical change it's meant to mark, disconnected from it. These tests
// would fail under that old ordering (revive last) and pass only once it
// plays first, alongside the change.
test('buildQueue places a revive phase before the swap phase, not after', () => {
  const queue = buildQueue(revivedCommitResult());
  const kinds = queue.map((phase) => phase.kind);
  assert.ok(kinds.includes('revive'), 'expected a revive phase in the queue');
  assert.ok(kinds.includes('swap'), 'expected a swap phase in the queue');
  assert.ok(
    kinds.indexOf('revive') < kinds.indexOf('swap'),
    `expected revive before swap, got order: ${JSON.stringify(kinds)}`
  );
});

test('buildQueue places a revive phase before every cascade phase, not after', () => {
  const queue = buildQueue(revivedCommitResult());
  const kinds = queue.map((phase) => phase.kind);
  const cascadeIndices = kinds.map((k, i) => (k === 'cascade' ? i : -1)).filter((i) => i >= 0);
  assert.ok(cascadeIndices.length > 0, 'expected at least one cascade phase in the queue');
  const reviveIndex = kinds.indexOf('revive');
  for (const cascadeIndex of cascadeIndices) {
    assert.ok(
      reviveIndex < cascadeIndex,
      `expected revive (index ${reviveIndex}) before every cascade phase, got order: ${JSON.stringify(kinds)}`
    );
  }
});

test('buildQueue\'s revive phase shows the pre-commit board underneath, with the final board reserved for the rotating cells', () => {
  const result = revivedCommitResult();
  const [revivePhase] = buildQueue(result);
  assert.equal(revivePhase.kind, 'revive');
  assert.deepEqual(revivePhase.board, result.swapAnimation.preSwapBoard, 'the background must be the board as it stood before this commit, since the swap/cascade haven\'t played yet at this point in the queue');
  assert.deepEqual(revivePhase.finalBoard, result.board, 'the rotating cells\' own drawn values must come from the final, already-revived board');
  assert.deepEqual(revivePhase.rotatingCells, result.rotatingCells);
});

test('buildQueue produces no revive phase at all when nothing revived', () => {
  const result = revivedCommitResult();
  result.revived = false;
  const queue = buildQueue(result);
  assert.ok(!queue.some((phase) => phase.kind === 'revive'), 'no revive phase should be queued when revived is false');
});
