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
  tryReviveTwoCells,
  reviveByIncrementalChange,
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
  // Row 0's diagonal values are [0,1,2,3,4,5,6,0] (period 7, GEM_TYPES.length -
  // wraps at col 7, not col 6). GEM_TYPES[2] differs from both neighbours
  // (col1=1, col6=6), so the run really is exactly 4 long.
  board[0][2] = GEM_TYPES[2];
  board[0][3] = GEM_TYPES[2];
  board[0][4] = GEM_TYPES[2];
  board[0][5] = GEM_TYPES[2]; // a run of 4

  const { matched } = findMatchedCells(board);

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

  const { matched } = findMatchedCells(board);

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

  const { matched } = findMatchedCells(board);

  assert.equal(matched[2][0], true, 'horizontal run starting at the first column must be marked');
  assert.equal(matched[2][1], true);
  assert.equal(matched[2][2], true);
  assert.equal(matched[0][2], true, 'vertical run starting at the first row must be marked');
  assert.equal(matched[1][2], true);
});

test('findMatchedCells returns a full SIZE x SIZE grid (no structural corruption at the boundary)', () => {
  const { matched } = findMatchedCells(buildMatchFreeBoard());
  assert.equal(matched.length, SIZE);
  for (const row of matched) assert.equal(row.length, SIZE);
});

test('findMatchedCells marks a cell that is part of both a horizontal and a vertical run once', () => {
  const board = buildMatchFreeBoard();
  board[3][3] = GEM_TYPES[1];
  board[3][4] = GEM_TYPES[1];
  board[3][5] = GEM_TYPES[1];
  board[1][3] = GEM_TYPES[1];
  board[2][3] = GEM_TYPES[1];
  // (3,3) is now the corner of an L: horizontal run [3][3..5] and vertical run [1..3][3]

  const { matched } = findMatchedCells(board);
  assert.equal(matched[3][3], true);
  assert.equal(matched[1][3], true);
  assert.equal(matched[2][3], true);
  assert.equal(matched[3][4], true);
  assert.equal(matched[3][5], true);
});

test('findMatchedCells reports one run length per qualifying run (SPEC 10.3)', () => {
  const board = buildMatchFreeBoard();
  board[0][2] = GEM_TYPES[2];
  board[0][3] = GEM_TYPES[2];
  board[0][4] = GEM_TYPES[2];
  board[0][5] = GEM_TYPES[2]; // a lone run of 4

  const { runLengths } = findMatchedCells(board);
  assert.deepEqual(runLengths, [4]);
});

test('findMatchedCells reports each run\'s own length separately when two runs clear together (SPEC 10.4)', () => {
  const board = buildMatchFreeBoard();
  // A 4-run on row 0, cols 2-5.
  board[0][2] = GEM_TYPES[2];
  board[0][3] = GEM_TYPES[2];
  board[0][4] = GEM_TYPES[2];
  board[0][5] = GEM_TYPES[2];
  // An unrelated 3-run on row 6, cols 0-2.
  board[6][0] = GEM_TYPES[1];
  board[6][1] = GEM_TYPES[1];
  board[6][2] = GEM_TYPES[1];

  const { runLengths } = findMatchedCells(board);
  assert.deepEqual([...runLengths].sort(), [3, 4]);
});

test('findMatchedCells reports an L-shaped intersection as two separate run lengths, not merged (SPEC 10.4)', () => {
  const board = buildMatchFreeBoard();
  // Same L fixture as the shared-cell test above: a horizontal 3-run and a
  // vertical 3-run sharing cell (3,3) - two runs, not one 5-cell run.
  board[3][3] = GEM_TYPES[1];
  board[3][4] = GEM_TYPES[1];
  board[3][5] = GEM_TYPES[1];
  board[1][3] = GEM_TYPES[1];
  board[2][3] = GEM_TYPES[1];

  const { runLengths } = findMatchedCells(board);
  assert.deepEqual([...runLengths].sort(), [3, 3]);
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

  const { board: fallen } = applyGravity(board);

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
  const { board: fallen } = applyGravity(board);
  for (let row = 0; row < SIZE; row++) {
    assert.equal(fallen[row][7], board[row][7]);
  }
});

test('applyGravity returns a full SIZE x SIZE grid (no extra columns from an off-by-one)', () => {
  const board = buildMatchFreeBoard();
  board[3][2] = null;
  const { board: fallen } = applyGravity(board);
  assert.equal(fallen.length, SIZE);
  for (const row of fallen) assert.equal(row.length, SIZE);
});

test('applyGravity reports a fall event only for cells that actually moved, with their real from/to rows', () => {
  const board = buildMatchFreeBoard();
  const col = 4;
  const survivorGem = board[3][col];
  board[1][col] = null;
  board[2][col] = null;
  // column 4, rows 0..7: [orig0, null, null, survivorGem, orig4, orig5, orig6, orig7]
  // after gravity: rows 0-1 null, row2=orig0 (fell 0->2), row3=survivorGem (fell 3->3, no move), rows4-7 unchanged

  const { fallEvents } = applyGravity(board);
  const colEvents = fallEvents.filter((e) => e.col === col);

  assert.equal(colEvents.length, 1, 'only the one cell that actually changed row should be reported');
  assert.deepEqual(colEvents[0], { col, fromRow: 0, toRow: 2, gemType: board[0][col] });
  // the cell that ends up in the same row it started in (survivorGem, row 3) must not be reported
  assert.ok(!fallEvents.some((e) => e.col === col && e.toRow === 3));
});

test('applyGravity reports no fall events for a column with no gaps', () => {
  const board = buildMatchFreeBoard();
  const { fallEvents } = applyGravity(board);
  assert.deepEqual(fallEvents.filter((e) => e.col === 7), []);
});

test('applyGravity reports exactly no fall events for a fully-populated board (no phantom entries)', () => {
  const { fallEvents } = applyGravity(buildMatchFreeBoard());
  assert.deepEqual(fallEvents, [], 'a board with no gaps at all must report an empty fallEvents array, not just one with no matching column');
});

test('refillBoard replaces every null with a known gem type and leaves existing gems alone', () => {
  const board = buildMatchFreeBoard();
  board[0][0] = null;
  board[7][7] = null;
  const untouchedValue = board[3][3];

  const { board: refilled } = refillBoard(board);

  assert.ok(GEM_TYPES.includes(refilled[0][0]));
  assert.ok(GEM_TYPES.includes(refilled[7][7]));
  assert.equal(refilled[3][3], untouchedValue);
});

test('refillBoard reports a refill event for every newly-filled cell, starting above the board in fall order', () => {
  const board = buildMatchFreeBoard();
  const col = 2;
  board[0][col] = null;
  board[1][col] = null;

  const { board: refilled, refillEvents } = refillBoard(board);
  const colEvents = refillEvents.filter((e) => e.col === col).sort((a, b) => a.row - b.row);

  assert.equal(colEvents.length, 2);
  assert.deepEqual(colEvents.map((e) => e.row), [0, 1]);
  // both entries fall into a 2-gap column, stacked above row 0 in the order they land:
  // the one landing at row 0 starts furthest up (-2), the one landing at row 1 starts at -1.
  assert.deepEqual(colEvents.map((e) => e.startRow), [-2, -1]);
  for (const event of colEvents) {
    assert.equal(event.gemType, refilled[event.row][col]);
  }
});

test('refillBoard reports no refill events when there is nothing to fill', () => {
  const { refillEvents } = refillBoard(buildMatchFreeBoard());
  assert.deepEqual(refillEvents, []);
});

test('refillBoard does not mutate the board it was given', () => {
  const board = buildMatchFreeBoard();
  board[0][0] = null;
  const originalRowZero = board[0].slice();

  refillBoard(board);

  assert.deepEqual(board[0], originalRowZero, 'the input board\'s row must be left exactly as it was, not written into in place');
});

test('resolveCascade clears matches, refills, and settles to a fully-filled match-free board', () => {
  for (let trial = 0; trial < 30; trial++) {
    const board = buildMatchFreeBoard();
    board[4][1] = GEM_TYPES[3];
    board[4][2] = GEM_TYPES[3];
    board[4][3] = GEM_TYPES[3];

    const { board: settled } = resolveCascade(board);

    assert.equal(hasMatch(settled), false, 'settled board must have no remaining match');
    for (const row of settled) {
      for (const cell of row) {
        assert.ok(cell !== null, 'no empty cell may remain after settling');
      }
    }
  }
});

test('resolveCascade reports one step whose clearEvents cover every originally-matched cell with its original gem type', () => {
  const board = buildMatchFreeBoard();
  board[4][1] = GEM_TYPES[3];
  board[4][2] = GEM_TYPES[3];
  board[4][3] = GEM_TYPES[3];

  const { steps } = resolveCascade(board);

  assert.ok(steps.length >= 1, 'a match must produce at least one resolution step');
  const allClearEvents = steps.flatMap((s) => s.clearEvents);
  const firstClears = allClearEvents.filter((e) => e.row === 4 && [1, 2, 3].includes(e.col));
  assert.equal(firstClears.length, 3, 'all 3 originally-matched cells must be reported as cleared');
  for (const event of firstClears) {
    assert.equal(event.gemType, GEM_TYPES[3], 'a clear event must carry the gem type it cleared, not the refilled value');
  }
});

test("resolveCascade's first step also reports how the surviving/refilled gems moved", () => {
  const board = buildMatchFreeBoard();
  board[4][1] = GEM_TYPES[3];
  board[4][2] = GEM_TYPES[3];
  board[4][3] = GEM_TYPES[3];

  const { steps } = resolveCascade(board);
  const [firstStep] = steps;

  assert.ok(firstStep.fallEvents.length + firstStep.refillEvents.length > 0, 'clearing 3 cells must move or refill something above them');
  for (const event of firstStep.refillEvents) {
    assert.ok(event.startRow < event.row, 'a refilled gem must start above the row it lands in');
  }
});

test("resolveCascade's clearEvents contain only the actually-matched cells, never an unmatched cell", () => {
  const board = buildMatchFreeBoard();
  board[4][1] = GEM_TYPES[3];
  board[4][2] = GEM_TYPES[3];
  board[4][3] = GEM_TYPES[3];

  const { steps } = resolveCascade(board);
  const [firstStep] = steps;

  assert.equal(firstStep.clearEvents.length, 3, 'exactly the 3 matched cells must be reported as cleared, no extras from the rest of the board');
  const clearedPositions = new Set(firstStep.clearEvents.map((e) => `${e.row},${e.col}`));
  assert.deepEqual(clearedPositions, new Set(['4,1', '4,2', '4,3']));
});

test("resolveCascade's step reports the run length of each run it actually cleared (SPEC 10.3)", () => {
  const board = buildMatchFreeBoard();
  board[4][1] = GEM_TYPES[3];
  board[4][2] = GEM_TYPES[3];
  board[4][3] = GEM_TYPES[3];

  const { steps } = resolveCascade(board);
  const [firstStep] = steps;

  assert.deepEqual(firstStep.runLengths, [3]);
});

test("resolveCascade's step reports separately-summed run lengths when two runs clear in the same step (SPEC 10.4)", () => {
  const board = buildMatchFreeBoard();
  board[0][2] = GEM_TYPES[2];
  board[0][3] = GEM_TYPES[2];
  board[0][4] = GEM_TYPES[2];
  board[0][5] = GEM_TYPES[2];
  board[6][0] = GEM_TYPES[1];
  board[6][1] = GEM_TYPES[1];
  board[6][2] = GEM_TYPES[1];

  const { steps } = resolveCascade(board);
  const [firstStep] = steps;

  assert.deepEqual([...firstStep.runLengths].sort(), [3, 4]);
});

test("resolveCascade's step reports the board exactly as it stood before that step's clear/fall/refill", () => {
  const board = buildMatchFreeBoard();
  board[4][1] = GEM_TYPES[3];
  board[4][2] = GEM_TYPES[3];
  board[4][3] = GEM_TYPES[3];

  const { steps } = resolveCascade(board);
  const [firstStep] = steps;

  assert.deepEqual(firstStep.boardBeforeStep, board, 'first step must show the board exactly as passed in, pre-clear');
  assert.equal(firstStep.boardBeforeStep[4][1], GEM_TYPES[3], 'the matched cells must still show their original (uncleared) gem type');
});

test('resolveCascade reports no steps when the board already has no match', () => {
  const { steps } = resolveCascade(buildMatchFreeBoard());
  assert.deepEqual(steps, []);
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
    ['purple-triangle', 'red-square', 'green-octagon', 'silver-octagon', 'purple-triangle', 'green-octagon', 'green-octagon', 'purple-triangle'],
    ['red-square', 'green-octagon', 'yellow-diamond', 'red-square', 'red-square', 'yellow-diamond', 'yellow-diamond', 'purple-triangle'],
    ['green-octagon', 'yellow-diamond', 'blue-teardrop', 'green-octagon', 'purple-triangle', 'silver-octagon', 'purple-triangle', 'red-square'],
    ['yellow-diamond', 'blue-teardrop', 'silver-octagon', 'purple-triangle', 'red-square', 'green-octagon', 'yellow-diamond', 'blue-teardrop'],
    ['blue-teardrop', 'silver-octagon', 'purple-triangle', 'red-square', 'green-octagon', 'yellow-diamond', 'blue-teardrop', 'silver-octagon'],
    ['silver-octagon', 'purple-triangle', 'red-square', 'green-octagon', 'yellow-diamond', 'blue-teardrop', 'silver-octagon', 'purple-triangle'],
    ['purple-triangle', 'red-square', 'green-octagon', 'yellow-diamond', 'blue-teardrop', 'silver-octagon', 'purple-triangle', 'red-square'],
    ['red-square', 'green-octagon', 'yellow-diamond', 'blue-teardrop', 'silver-octagon', 'purple-triangle', 'red-square', 'green-octagon'],
  ];
  // the only valid move is swapping (2,6)<->(2,7), completing a horizontal run at row 2

  assert.equal(hasMatch(board), false, 'sanity: fixture itself has no pre-existing match');
  assert.equal(hasAnyValidMove(board), true);
});

test('hasAnyValidMove detects a valid move that can only be found via a vertical swap (and only that move exists)', () => {
  const board = [
    ['green-octagon', 'yellow-diamond', 'blue-teardrop', 'purple-triangle', 'blue-teardrop', 'silver-octagon', 'purple-triangle', 'red-square'],
    ['green-octagon', 'red-square', 'purple-triangle', 'red-square', 'silver-octagon', 'purple-triangle', 'red-square', 'green-octagon'],
    ['purple-triangle', 'purple-triangle', 'red-square', 'blue-teardrop', 'purple-triangle', 'red-square', 'green-octagon', 'yellow-diamond'],
    ['yellow-diamond', 'blue-teardrop', 'silver-octagon', 'yellow-diamond', 'red-square', 'green-octagon', 'yellow-diamond', 'blue-teardrop'],
    ['blue-teardrop', 'silver-octagon', 'purple-triangle', 'red-square', 'green-octagon', 'yellow-diamond', 'blue-teardrop', 'silver-octagon'],
    ['silver-octagon', 'purple-triangle', 'red-square', 'green-octagon', 'yellow-diamond', 'blue-teardrop', 'silver-octagon', 'purple-triangle'],
    ['purple-triangle', 'red-square', 'green-octagon', 'yellow-diamond', 'blue-teardrop', 'silver-octagon', 'purple-triangle', 'red-square'],
    ['red-square', 'green-octagon', 'yellow-diamond', 'blue-teardrop', 'silver-octagon', 'purple-triangle', 'red-square', 'green-octagon'],
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

  const { board: result, changedCells } = ensurePlayable(board);
  assert.strictEqual(result, board);
  assert.deepEqual(changedCells, []);
});

// Applying a function's own reported changedCells onto the original board must
// exactly reproduce its returned board - catches a changedCells entry that's
// hollow/wrong (e.g. missing fields) even though the returned board is correct.
function applyChanges(board, changedCells) {
  const next = board.map((r) => r.slice());
  for (const { row, col, gemType } of changedCells) next[row][col] = gemType;
  return next;
}

test('ensurePlayable revives a stuck board in place with a single minimal change, never a whole-board reshuffle (SPEC 8.3)', () => {
  const stuck = buildStuckBoard();
  const { board: result, changedCells } = ensurePlayable(stuck);

  assert.equal(result.length, stuck.length, 'must keep the board\'s own size - never replaced by a fresh reshuffle');
  // This fixture is known solvable with one cell - the count itself is what
  // would catch an orchestration bug that falls through to a larger, non-minimal
  // fallback even though the smallest pass already succeeded.
  assert.equal(changedCells.length, 1, 'expected exactly one changed cell for this fixture');
  assert.deepEqual(applyChanges(stuck, changedCells), result, 'changedCells must fully account for the diff from the original board');
  assert.equal(hasMatch(result), false, 'the revived board must not itself contain an immediate match');
  assert.equal(hasAnyValidMove(result), true, 'the revived board must have at least one valid move');
});

test('tryReviveTwoCells (the SPEC 8.3.2 fallback) finds a minimal two-cell change', () => {
  const stuck = buildStuckBoard();
  const result = tryReviveTwoCells(stuck);

  assert.ok(result, 'expected a two-cell revive to be found');
  assert.equal(result.changedCells.length, 2);
  assert.deepEqual(applyChanges(stuck, result.changedCells), result.board, 'changedCells must fully account for the diff from the original board');
  assert.equal(hasMatch(result.board), false);
  assert.equal(hasAnyValidMove(result.board), true);
});

test('reviveByIncrementalChange (the absolute last-resort fallback) always finds a valid-move-enabling board', () => {
  const stuck = buildStuckBoard();
  const { board: result, changedCells } = reviveByIncrementalChange(stuck);

  assert.equal(hasMatch(result), false);
  assert.equal(hasAnyValidMove(result), true);
  assert.deepEqual(applyChanges(stuck, changedCells), result, 'changedCells must fully account for the diff from the original board');
  assert.ok(
    changedCells.length >= 1 && changedCells.length <= stuck.length * stuck.length,
    'expected a bounded number of changes'
  );
});

// A revive function handed the caller's own board (e.g. game.js's committed
// board, still referenced elsewhere for animation) must never mutate it in
// place - only ever return a new one.
test('tryReviveTwoCells never mutates its input board', () => {
  const stuck = buildStuckBoard();
  const snapshot = JSON.stringify(stuck);
  tryReviveTwoCells(stuck);
  assert.equal(JSON.stringify(stuck), snapshot, 'the input board must not be mutated');
});

test('reviveByIncrementalChange never mutates its input board', () => {
  const stuck = buildStuckBoard();
  const snapshot = JSON.stringify(stuck);
  reviveByIncrementalChange(stuck);
  assert.equal(JSON.stringify(stuck), snapshot, 'the input board must not be mutated');
});

test('ensurePlayable never mutates its input board', () => {
  const stuck = buildStuckBoard();
  const snapshot = JSON.stringify(stuck);
  ensurePlayable(stuck);
  assert.equal(JSON.stringify(stuck), snapshot, 'the input board must not be mutated');
});
