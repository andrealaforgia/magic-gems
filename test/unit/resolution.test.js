import { test } from 'node:test';
import assert from 'node:assert';
import { loadMagicGems } from '../support/load-src.js';

const {
  GEM_TYPES,
  hasMatch,
  applySwap,
  findMatchedCells,
  clearMatches,
  applyGravity,
  refillBoard,
  resolveCascade,
  hasAnyValidMove,
  ensurePlayable,
} = loadMagicGems([
  new URL('../../src/gems.js', import.meta.url),
  new URL('../../src/board.js', import.meta.url),
  new URL('../../src/resolution.js', import.meta.url),
]);

const SIZE = 8;

// Deterministic, provably match-free fixture (see test/unit/board.test.js): 3
// consecutive cells in any row or column always take 3 distinct residues mod 6.
function buildMatchFreeBoard() {
  const board = [];
  for (let row = 0; row < SIZE; row++) {
    const cells = [];
    for (let col = 0; col < SIZE; col++) {
      cells.push(GEM_TYPES[(row + col) % GEM_TYPES.length]);
    }
    board.push(cells);
  }
  return board;
}

// A 3x3 Latin square (each row/column a permutation of the same 3 types). At exactly
// match-length wide and tall, a run of 3 requires ALL 3 cells in a row/column to
// match; a swap within a row/column merely reorders that row/column's existing 3
// distinct values (never 3-identical), and a swap across rows/columns can produce at
// most 2 duplicates in a 3-wide/tall line, never all 3 — so this board provably has
// no match and no valid move, verified directly against hasMatch/hasAnyValidMove.
function buildStuckBoard() {
  return [
    [GEM_TYPES[0], GEM_TYPES[1], GEM_TYPES[2]],
    [GEM_TYPES[1], GEM_TYPES[2], GEM_TYPES[0]],
    [GEM_TYPES[2], GEM_TYPES[0], GEM_TYPES[1]],
  ];
}

test('applySwap exchanges exactly the two given cells and leaves the rest untouched', () => {
  const board = buildMatchFreeBoard();
  const before = JSON.stringify(board);
  const a = { row: 2, col: 3 };
  const b = { row: 2, col: 4 };
  const originalA = board[a.row][a.col];
  const originalB = board[b.row][b.col];

  const swapped = applySwap(board, a, b);

  assert.equal(swapped[a.row][a.col], originalB);
  assert.equal(swapped[b.row][b.col], originalA);
  assert.equal(JSON.stringify(board), before, 'applySwap must not mutate its input');

  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if ((row === a.row && col === a.col) || (row === b.row && col === b.col)) continue;
      assert.equal(swapped[row][col], board[row][col]);
    }
  }
});

test('findMatchedCells marks every cell of a run, including runs longer than 3', () => {
  const board = buildMatchFreeBoard();
  // Row 0's diagonal values are [0,1,2,3,4,5,0,1] (period 6 wraps at col 6) - using
  // GEM_TYPES[0] here would silently extend into col 6, which already holds that
  // same value from the wrap. GEM_TYPES[2] differs from both neighbours (col1=1,
  // col6=0), so the run really is exactly 4 long.
  board[0][2] = GEM_TYPES[2];
  board[0][3] = GEM_TYPES[2];
  board[0][4] = GEM_TYPES[2];
  board[0][5] = GEM_TYPES[2]; // a run of 4

  const matched = findMatchedCells(board);

  assert.equal(matched[0][2], true);
  assert.equal(matched[0][3], true);
  assert.equal(matched[0][4], true);
  assert.equal(matched[0][5], true);
  assert.equal(matched[0][1], false);
  assert.equal(matched[0][6], false);
});

test('findMatchedCells marks a run that ends exactly at the last column or last row', () => {
  const board = buildMatchFreeBoard();
  // Row 1: [1,2,3,4,5,0,1,2] - cols 5,6,7 overwritten with a value distinct from
  // col4 (5), so the run is exactly 3 long and ends at the board's right edge.
  board[1][5] = GEM_TYPES[3];
  board[1][6] = GEM_TYPES[3];
  board[1][7] = GEM_TYPES[3];
  // Column 5: [5,0,1,2,3,4,5,0] - rows 5,6,7 overwritten with a value distinct from
  // row4 (3), so the run is exactly 3 long and ends at the board's bottom edge.
  board[5][5] = GEM_TYPES[1];
  board[6][5] = GEM_TYPES[1];
  board[7][5] = GEM_TYPES[1];

  const matched = findMatchedCells(board);

  assert.equal(matched[1][5], true, 'horizontal run ending at the last column must be marked');
  assert.equal(matched[1][6], true);
  assert.equal(matched[1][7], true);
  assert.equal(matched[5][5], true, 'vertical run ending at the last row must be marked');
  assert.equal(matched[6][5], true);
  assert.equal(matched[7][5], true);
});

test('findMatchedCells marks a run that starts exactly at the first column or first row', () => {
  const board = buildMatchFreeBoard();
  // Row 2: [2,3,4,5,0,1,2,3] - cols 0,1,2 overwritten with a value distinct from
  // col3 (5), so the run is exactly 3 long and starts at the board's left edge.
  board[2][0] = GEM_TYPES[1];
  board[2][1] = GEM_TYPES[1];
  board[2][2] = GEM_TYPES[1];
  // Column 2: [2,3,4,5,0,1,2,3] - rows 0,1,2 overwritten with a value distinct from
  // row3 (5), so the run is exactly 3 long and starts at the board's top edge.
  board[0][2] = GEM_TYPES[1];
  board[1][2] = GEM_TYPES[1];

  const matched = findMatchedCells(board);

  assert.equal(matched[2][0], true, 'horizontal run starting at the first column must be marked');
  assert.equal(matched[2][1], true);
  assert.equal(matched[2][2], true);
  assert.equal(matched[0][2], true, 'vertical run starting at the first row must be marked');
  assert.equal(matched[1][2], true);
});

test('findMatchedCells returns a full SIZE x SIZE grid (no structural corruption at the boundary)', () => {
  const matched = findMatchedCells(buildMatchFreeBoard());
  assert.equal(matched.length, SIZE);
  for (const row of matched) assert.equal(row.length, SIZE);
});

test('findMatchedCells marks a cell that is part of both a horizontal and a vertical run once', () => {
  const board = buildMatchFreeBoard();
  board[3][3] = GEM_TYPES[2];
  board[3][4] = GEM_TYPES[2];
  board[3][5] = GEM_TYPES[2];
  board[1][3] = GEM_TYPES[2];
  board[2][3] = GEM_TYPES[2];
  // (3,3) is now the corner of an L: horizontal run [3][3..5] and vertical run [1..3][3]

  const matched = findMatchedCells(board);
  assert.equal(matched[3][3], true);
  assert.equal(matched[1][3], true);
  assert.equal(matched[2][3], true);
  assert.equal(matched[3][4], true);
  assert.equal(matched[3][5], true);
});

test('clearMatches nulls out matched cells and leaves everything else unchanged', () => {
  const board = buildMatchFreeBoard();
  const matched = Array.from({ length: SIZE }, () => new Array(SIZE).fill(false));
  matched[5][5] = true;
  matched[5][6] = true;

  const cleared = clearMatches(board, matched);

  assert.equal(cleared[5][5], null);
  assert.equal(cleared[5][6], null);
  assert.equal(cleared[0][0], board[0][0]);
});

test('applyGravity compacts each column downward, preserving order, nulls float to the top', () => {
  const board = buildMatchFreeBoard();
  const col = 4;
  board[1][col] = null;
  board[2][col] = null;

  const fallen = applyGravity(board);

  // the two nulls must end up at the top of the column
  assert.equal(fallen[0][col], null);
  assert.equal(fallen[1][col], null);
  // the two surviving values from that column must appear, in original relative order, at the bottom
  const survivors = [];
  for (let row = 0; row < SIZE; row++) {
    if (board[row][col] !== null) survivors.push(board[row][col]);
  }
  const bottomOfColumn = [];
  for (let row = 2; row < SIZE; row++) bottomOfColumn.push(fallen[row][col]);
  assert.deepEqual(bottomOfColumn, survivors);
});

test('applyGravity does not touch a column with no gaps', () => {
  const board = buildMatchFreeBoard();
  const fallen = applyGravity(board);
  for (let row = 0; row < SIZE; row++) {
    assert.equal(fallen[row][7], board[row][7]);
  }
});

test('applyGravity returns a full SIZE x SIZE grid (no extra columns from an off-by-one)', () => {
  const board = buildMatchFreeBoard();
  board[3][2] = null;
  const fallen = applyGravity(board);
  assert.equal(fallen.length, SIZE);
  for (const row of fallen) assert.equal(row.length, SIZE);
});

test('refillBoard replaces every null with a known gem type and leaves existing gems alone', () => {
  const board = buildMatchFreeBoard();
  board[0][0] = null;
  board[7][7] = null;
  const untouchedValue = board[3][3];

  const refilled = refillBoard(board);

  assert.ok(GEM_TYPES.includes(refilled[0][0]));
  assert.ok(GEM_TYPES.includes(refilled[7][7]));
  assert.equal(refilled[3][3], untouchedValue);
});

test('resolveCascade clears matches, refills, and settles to a fully-filled match-free board', () => {
  for (let trial = 0; trial < 30; trial++) {
    const board = buildMatchFreeBoard();
    board[4][1] = GEM_TYPES[3];
    board[4][2] = GEM_TYPES[3];
    board[4][3] = GEM_TYPES[3];

    const settled = resolveCascade(board);

    assert.equal(hasMatch(settled), false, 'settled board must have no remaining match');
    for (const row of settled) {
      for (const cell of row) {
        assert.ok(cell !== null, 'no empty cell may remain after settling');
      }
    }
  }
});

test('hasAnyValidMove is false for a board where no adjacent swap can create a match', () => {
  assert.equal(hasMatch(buildStuckBoard()), false, 'sanity: fixture itself has no pre-existing match');
  assert.equal(hasAnyValidMove(buildStuckBoard()), false);
});

test('hasAnyValidMove is true when a specific adjacent swap would create a match', () => {
  const board = buildMatchFreeBoard();
  board[0][2] = GEM_TYPES[0];
  board[1][2] = GEM_TYPES[0];
  board[2][2] = GEM_TYPES[1];
  board[2][1] = GEM_TYPES[0];
  assert.equal(hasMatch(board), false, 'sanity: fixture itself has no pre-existing match');

  assert.equal(hasAnyValidMove(board), true);
});

// These next two fixtures are fully hand-specified, not diagonal-derived: an earlier
// attempt built them as buildMatchFreeBoard() plus a few overrides, but the diagonal
// pattern's period-6 repetition kept coincidentally creating *extra*, unintended valid
// moves elsewhere on the board (discovered by exhaustively enumerating every adjacent
// swap) - any one of which could still be found by a broken check, silently masking
// the very regression these tests exist to catch. Each fixture below was found by
// search and then confirmed, by the same exhaustive enumeration, to contain *exactly*
// one valid move: the one named in the test.

test("hasAnyValidMove detects a valid move at the board's rightmost column pair (and only that move exists)", () => {
  const board = [
    ['purple-triangle', 'red-square', 'green-circle', 'white-circle', 'purple-triangle', 'green-circle', 'green-circle', 'purple-triangle'],
    ['red-square', 'green-circle', 'yellow-diamond', 'red-square', 'red-square', 'yellow-diamond', 'yellow-diamond', 'purple-triangle'],
    ['green-circle', 'yellow-diamond', 'blue-diamond', 'green-circle', 'purple-triangle', 'white-circle', 'purple-triangle', 'red-square'],
    ['yellow-diamond', 'blue-diamond', 'white-circle', 'purple-triangle', 'red-square', 'green-circle', 'yellow-diamond', 'blue-diamond'],
    ['blue-diamond', 'white-circle', 'purple-triangle', 'red-square', 'green-circle', 'yellow-diamond', 'blue-diamond', 'white-circle'],
    ['white-circle', 'purple-triangle', 'red-square', 'green-circle', 'yellow-diamond', 'blue-diamond', 'white-circle', 'purple-triangle'],
    ['purple-triangle', 'red-square', 'green-circle', 'yellow-diamond', 'blue-diamond', 'white-circle', 'purple-triangle', 'red-square'],
    ['red-square', 'green-circle', 'yellow-diamond', 'blue-diamond', 'white-circle', 'purple-triangle', 'red-square', 'green-circle'],
  ];
  // the only valid move is swapping (2,6)<->(2,7), completing a horizontal run at row 2

  assert.equal(hasMatch(board), false, 'sanity: fixture itself has no pre-existing match');
  assert.equal(hasAnyValidMove(board), true);
});

test('hasAnyValidMove detects a valid move that can only be found via a vertical swap (and only that move exists)', () => {
  const board = [
    ['green-circle', 'yellow-diamond', 'blue-diamond', 'purple-triangle', 'blue-diamond', 'white-circle', 'purple-triangle', 'red-square'],
    ['green-circle', 'red-square', 'purple-triangle', 'red-square', 'white-circle', 'purple-triangle', 'red-square', 'green-circle'],
    ['purple-triangle', 'purple-triangle', 'red-square', 'blue-diamond', 'purple-triangle', 'red-square', 'green-circle', 'yellow-diamond'],
    ['yellow-diamond', 'blue-diamond', 'white-circle', 'yellow-diamond', 'red-square', 'green-circle', 'yellow-diamond', 'blue-diamond'],
    ['blue-diamond', 'white-circle', 'purple-triangle', 'red-square', 'green-circle', 'yellow-diamond', 'blue-diamond', 'white-circle'],
    ['white-circle', 'purple-triangle', 'red-square', 'green-circle', 'yellow-diamond', 'blue-diamond', 'white-circle', 'purple-triangle'],
    ['purple-triangle', 'red-square', 'green-circle', 'yellow-diamond', 'blue-diamond', 'white-circle', 'purple-triangle', 'red-square'],
    ['red-square', 'green-circle', 'yellow-diamond', 'blue-diamond', 'white-circle', 'purple-triangle', 'red-square', 'green-circle'],
  ];
  // the only valid move is swapping (1,2)<->(2,2), completing a vertical run at column 2

  assert.equal(hasMatch(board), false, 'sanity: fixture itself has no pre-existing match');
  assert.equal(hasAnyValidMove(board), true);
});

test('ensurePlayable leaves an already-playable board untouched', () => {
  const board = buildMatchFreeBoard();
  board[0][2] = GEM_TYPES[0];
  board[1][2] = GEM_TYPES[0];
  board[2][2] = GEM_TYPES[1];
  board[2][1] = GEM_TYPES[0];

  const result = ensurePlayable(board);
  assert.deepEqual(result, board);
});

test('ensurePlayable reshuffles a stuck board into a new, match-free, playable arrangement', () => {
  const stuck = buildStuckBoard();
  const result = ensurePlayable(stuck);

  assert.equal(hasMatch(result), false, 'reshuffled board must be match-free');
  assert.equal(hasAnyValidMove(result), true, 'reshuffled board must have at least one valid move');
});
