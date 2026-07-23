import { test } from 'node:test';
import assert from 'node:assert';
import { loadMagicGems } from '../support/load-src.js';

const {
  GEM_TYPES,
  hasMatch,
  createInteractionState,
  handleKey,
  handleGameKey,
} = loadMagicGems([
  new URL('../../src/gems.js', import.meta.url),
  new URL('../../src/board.js', import.meta.url),
  new URL('../../src/interaction.js', import.meta.url),
  new URL('../../src/resolution.js', import.meta.url),
  new URL('../../src/game.js', import.meta.url),
]);

const SIZE = 8;
const SPACE = ' ';

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

test('a non-space, non-committing key only moves the interaction state; the board is untouched', () => {
  const board = buildMatchFreeBoard();
  const interaction = createInteractionState();

  const next = handleGameKey({ board, interaction }, 'ArrowRight');

  assert.strictEqual(next.board, board);
  assert.deepEqual(next.interaction.cursor, { row: 0, col: 1 });
  assert.deepEqual(next.clearEvents, []);
});

test('SPACE with a selection but no target does not commit anything (matches B2 no-op)', () => {
  const board = buildMatchFreeBoard();
  const selected = handleKey(createInteractionState(), SPACE);

  const next = handleGameKey({ board, interaction: selected }, SPACE);

  assert.strictEqual(next.board, board);
  assert.strictEqual(next.interaction, selected);
});

test('an arrow key while a selection and target both already exist re-aims the target instead of committing', () => {
  const board = buildMatchFreeBoard();
  const withTarget = handleKey(handleKey(createInteractionState(), SPACE), 'ArrowRight');

  const next = handleGameKey({ board, interaction: withTarget }, 'ArrowDown');

  assert.strictEqual(next.board, board, 'a non-SPACE key must never commit a swap');
  assert.deepEqual(next.interaction.selection, { row: 0, col: 0 });
  assert.deepEqual(next.interaction.target, { row: 1, col: 0 }, 'the target re-aims per ordinary B2 behaviour');
});

test('committing a swap that produces no match reverts the board and cancels the selection', () => {
  const board = buildMatchFreeBoard();
  // Selects (0,0), targets (0,1). Swapping those two diagonal-pattern cells creates
  // at most 2 adjacent duplicates in either column, never a 3-run.
  const withTarget = handleKey(handleKey(createInteractionState(), SPACE), 'ArrowRight');
  assert.equal(hasMatch(board), false, 'sanity: fixture itself has no pre-existing match');

  const next = handleGameKey({ board, interaction: withTarget }, SPACE);

  assert.deepEqual(next.board, board, 'board contents must be identical to before the swap attempt');
  assert.equal(next.interaction.selection, null);
  assert.equal(next.interaction.target, null);
  assert.deepEqual(next.interaction.cursor, { row: 0, col: 0 }, 'cursor returns to the original selection cell');
  assert.deepEqual(next.clearEvents, [], 'a reverted swap must report no clear events (nothing to shatter)');
});

test('committing a swap that produces a match clears it, settles the board, and returns to plain cursor mode', () => {
  const board = buildMatchFreeBoard();
  // Column 2, rows 0-1 already hold type 0; row 2 holds type 1. Column 1, row 2
  // holds type 0. Swapping (2,1)<->(2,2) (horizontal) brings type 0 into (2,2),
  // completing a vertical run of 3 at column 2, rows 0-2 (same fixture proven in
  // resolution.test.js's "hasAnyValidMove is true" case).
  board[0][2] = GEM_TYPES[0];
  board[1][2] = GEM_TYPES[0];
  board[2][2] = GEM_TYPES[1];
  board[2][1] = GEM_TYPES[0];
  assert.equal(hasMatch(board), false, 'sanity: fixture itself has no pre-existing match');

  const interaction = {
    cursor: { row: 2, col: 1 },
    selection: { row: 2, col: 1 },
    target: { row: 2, col: 2 },
  };

  const next = handleGameKey({ board, interaction }, SPACE);

  assert.notDeepEqual(next.board, board, 'the board must change once a match clears and refills');
  assert.equal(hasMatch(next.board), false, 'the settled board must have no remaining match');
  for (const row of next.board) {
    for (const cell of row) assert.ok(cell !== null);
  }
  assert.equal(next.interaction.selection, null);
  assert.equal(next.interaction.target, null);

  const clearedPositions = next.clearEvents.map((e) => `${e.row},${e.col}`);
  assert.ok(clearedPositions.includes('0,2'));
  assert.ok(clearedPositions.includes('1,2'));
  assert.ok(clearedPositions.includes('2,2'));
  for (const event of next.clearEvents) {
    assert.ok(GEM_TYPES.includes(event.gemType));
  }
});
