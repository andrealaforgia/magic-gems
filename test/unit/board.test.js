import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMagicGems } from '../support/load-src.js';
import { buildMatchFreeBoard as buildMatchFreeBoardFor } from '../support/board-fixtures.js';

const { GEM_TYPES, generateBoard, hasMatch } = loadMagicGems([
  new URL('../../src/gems.js', import.meta.url),
  new URL('../../src/board.js', import.meta.url),
]);

const SIZE = 8;

function countCells(board) {
  return board.reduce((n, row) => n + row.length, 0);
}

function buildMatchFreeBoard() {
  return buildMatchFreeBoardFor(GEM_TYPES);
}

test('generateBoard produces an 8x8 grid', () => {
  const board = generateBoard();
  assert.equal(board.length, SIZE);
  for (const row of board) assert.equal(row.length, SIZE);
  assert.equal(countCells(board), 64);
});

test('every cell holds exactly one known gem type', () => {
  const board = generateBoard();
  for (const row of board) {
    for (const gem of row) {
      assert.ok(gem !== null && gem !== undefined, 'cell must not be empty');
      assert.ok(GEM_TYPES.includes(gem), `unexpected gem type: ${gem}`);
    }
  }
});

test('generateBoard yields no pre-existing horizontal or vertical match of 3+', () => {
  for (let i = 0; i < 50; i++) {
    const board = generateBoard();
    assert.equal(hasMatch(board), false, 'board must start match-free');
  }
});

test('generateBoard is randomized across calls', () => {
  const boards = Array.from({ length: 5 }, () => generateBoard());
  const serialized = boards.map((b) => JSON.stringify(b));
  const allIdentical = serialized.every((s) => s === serialized[0]);
  assert.equal(allIdentical, false, 'repeated generation must not be a fixed layout');
});

test('the diagonal fixture itself has no match (sanity check on the fixture)', () => {
  assert.equal(hasMatch(buildMatchFreeBoard()), false);
});

test('hasMatch detects a horizontal run of 3', () => {
  const board = buildMatchFreeBoard();
  board[3][2] = GEM_TYPES[0];
  board[3][3] = GEM_TYPES[0];
  board[3][4] = GEM_TYPES[0];
  assert.equal(hasMatch(board), true);
});

test('hasMatch detects a vertical run of 3', () => {
  const board = buildMatchFreeBoard();
  board[2][3] = GEM_TYPES[1];
  board[3][3] = GEM_TYPES[1];
  board[4][3] = GEM_TYPES[1];
  assert.equal(hasMatch(board), true);
});
