import { test } from 'node:test';
import assert from 'node:assert';
import { loadMagicGems } from '../support/load-src.js';
import {
  buildMatchFreeBoard as buildMatchFreeBoardFor,
  buildStuckBoard as buildStuckBoardFor,
} from '../support/board-fixtures.js';

const { GEM_TYPES, planAutoplaySteps } = loadMagicGems([
  new URL('../../src/gems.js', import.meta.url),
  new URL('../../src/board.js', import.meta.url),
  new URL('../../src/resolution.js', import.meta.url),
  new URL('../../src/autoplay.js', import.meta.url),
]);

function buildMatchFreeBoard() {
  return buildMatchFreeBoardFor(GEM_TYPES);
}

function buildStuckBoard() {
  return buildStuckBoardFor(GEM_TYPES);
}

test('planAutoplaySteps returns no steps when no valid move exists (SPEC 8.3 guarantees this never happens live)', () => {
  assert.deepEqual(planAutoplaySteps(buildStuckBoard(), { row: 0, col: 0 }), []);
});

test('planAutoplaySteps ends with SPACE, an orthogonal arrow, then SPACE - select, aim, commit (SPEC 12.2)', () => {
  const board = buildMatchFreeBoard();
  board[0][2] = GEM_TYPES[0];
  board[1][2] = GEM_TYPES[0];
  board[2][2] = GEM_TYPES[1];
  board[2][1] = GEM_TYPES[0];

  const steps = planAutoplaySteps(board, { row: 2, col: 1 });
  assert.ok(steps.length >= 3, 'expected at least select, aim, and commit');
  assert.deepEqual(steps.slice(-3), [' ', 'ArrowRight', ' ']);
});

test('planAutoplaySteps moves the cursor from its current position to the move\'s own first cell before selecting', () => {
  const board = buildMatchFreeBoard();
  board[0][2] = GEM_TYPES[0];
  board[1][2] = GEM_TYPES[0];
  board[2][2] = GEM_TYPES[1];
  board[2][1] = GEM_TYPES[0];

  // Cursor starts two cells away (up and left) from the move's own cell (2,1).
  const steps = planAutoplaySteps(board, { row: 0, col: 0 });
  const spaceIndex = steps.indexOf(' ');
  assert.ok(spaceIndex > 0, 'expected at least one cursor move before the first SPACE');
  const movementSteps = steps.slice(0, spaceIndex);
  assert.equal(movementSteps.filter((k) => k === 'ArrowDown').length, 2);
  assert.equal(movementSteps.filter((k) => k === 'ArrowRight').length, 1);
});

test('planAutoplaySteps selects the exact cell the found move starts from, not wherever the cursor already is', () => {
  const board = buildMatchFreeBoard();
  board[0][2] = GEM_TYPES[0];
  board[1][2] = GEM_TYPES[0];
  board[2][2] = GEM_TYPES[1];
  board[2][1] = GEM_TYPES[0];

  const steps = planAutoplaySteps(board, { row: 2, col: 1 });
  // Cursor already at the move's own cell - no movement needed before selecting.
  assert.deepEqual(steps, [' ', 'ArrowRight', ' ']);
});

test('planAutoplaySteps moves up and left when the cursor sits below and to the right of the move (SPEC 12.2)', () => {
  const board = buildMatchFreeBoard();
  board[0][2] = GEM_TYPES[0];
  board[1][2] = GEM_TYPES[0];
  board[2][2] = GEM_TYPES[1];
  board[2][1] = GEM_TYPES[0];

  const steps = planAutoplaySteps(board, { row: 5, col: 5 });
  assert.deepEqual(steps, ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', ' ', 'ArrowRight', ' ']);
});

test('planAutoplaySteps moves purely left when the cursor already shares the move\'s own row', () => {
  const board = buildMatchFreeBoard();
  board[0][2] = GEM_TYPES[0];
  board[1][2] = GEM_TYPES[0];
  board[2][2] = GEM_TYPES[1];
  board[2][1] = GEM_TYPES[0];

  const steps = planAutoplaySteps(board, { row: 2, col: 5 });
  assert.deepEqual(steps, ['ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', ' ', 'ArrowRight', ' ']);
});

test('planAutoplaySteps moves purely up when the cursor already shares the move\'s own column', () => {
  const board = buildMatchFreeBoard();
  board[0][2] = GEM_TYPES[0];
  board[1][2] = GEM_TYPES[0];
  board[2][2] = GEM_TYPES[1];
  board[2][1] = GEM_TYPES[0];

  const steps = planAutoplaySteps(board, { row: 5, col: 1 });
  assert.deepEqual(steps, ['ArrowUp', 'ArrowUp', 'ArrowUp', ' ', 'ArrowRight', ' ']);
});

test('planAutoplaySteps aims ArrowDown when the found move\'s pair is a vertical (below) neighbour, not just horizontal (SPEC 12.2)', () => {
  const board = buildMatchFreeBoard();
  board[2][0] = GEM_TYPES[0];
  board[2][1] = GEM_TYPES[0];
  board[2][2] = GEM_TYPES[1];
  board[1][2] = GEM_TYPES[0];

  const steps = planAutoplaySteps(board, { row: 1, col: 2 });
  assert.deepEqual(steps, [' ', 'ArrowDown', ' ']);
});
