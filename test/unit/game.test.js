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
  assert.equal(next.swapAnimation, null);
  assert.deepEqual(next.steps, []);
});

test('SPACE with a selection but no target does not commit anything (matches B2 no-op)', () => {
  const board = buildMatchFreeBoard();
  const selected = handleKey(createInteractionState(), SPACE);

  const next = handleGameKey({ board, interaction: selected }, SPACE);

  assert.strictEqual(next.board, board);
  assert.strictEqual(next.interaction, selected);
  assert.equal(next.swapAnimation, null);
});

test('an arrow key while a selection and target both already exist re-aims the target instead of committing', () => {
  const board = buildMatchFreeBoard();
  const withTarget = handleKey(handleKey(createInteractionState(), SPACE), 'ArrowRight');

  const next = handleGameKey({ board, interaction: withTarget }, 'ArrowDown');

  assert.strictEqual(next.board, board, 'a non-SPACE key must never commit a swap');
  assert.deepEqual(next.interaction.selection, { row: 0, col: 0 });
  assert.deepEqual(next.interaction.target, { row: 1, col: 0 }, 'the target re-aims per ordinary B2 behaviour');
  assert.equal(next.swapAnimation, null);
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
  assert.deepEqual(next.steps, [], 'a reverted swap must report no resolution steps (nothing to shatter/fall)');

  assert.deepEqual(next.swapAnimation.a, { row: 0, col: 0 });
  assert.deepEqual(next.swapAnimation.b, { row: 0, col: 1 });
  assert.strictEqual(next.swapAnimation.preSwapBoard, board);
  assert.equal(next.swapAnimation.matched, false);
  assert.equal(next.revived, false, 'a reverted (no-match) swap never triggers a revive check');
  assert.deepEqual(next.changedCells, [], 'a reverted swap must report no changed cells');
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

  assert.deepEqual(next.swapAnimation.a, { row: 2, col: 1 });
  assert.deepEqual(next.swapAnimation.b, { row: 2, col: 2 });
  assert.strictEqual(next.swapAnimation.preSwapBoard, board);
  assert.equal(next.swapAnimation.matched, true);
  // An 8x8 board with 7 gem types settling from a real cascade is never actually
  // left stuck (astronomically unlikely) - ensurePlayable's own revive-vs-not
  // branches are independently proven in resolution.test.js; this just checks
  // commit() surfaces whichever one it took.
  assert.equal(next.revived, false);

  assert.ok(next.steps.length >= 1);
  const clearEvents = next.steps.flatMap((s) => s.clearEvents);
  const clearedPositions = clearEvents.map((e) => `${e.row},${e.col}`);
  assert.ok(clearedPositions.includes('0,2'));
  assert.ok(clearedPositions.includes('1,2'));
  assert.ok(clearedPositions.includes('2,2'));
  for (const event of clearEvents) {
    assert.ok(GEM_TYPES.includes(event.gemType));
  }
});

test('committing a match that settles into a board with no valid moves left revives it in place (SPEC 8.3), reported via revived:true', () => {
  // The board below (a 3x3, small enough to fully control) has no pre-existing
  // match. Swapping (2,0)<->(2,1) completes a vertical run of 3 at column 0, which
  // clears and refills; the refill's own random draws are pinned (via randomQueue)
  // so column 0 comes back as three distinct types. The RESULTING post-swap,
  // post-refill board - [[T0,T3,T4],[T1,T5,T6],[T2,T2,T1]], not the fixture below -
  // has been hand-verified to admit no match-producing adjacent swap at all across
  // all 12 of its possible swaps, i.e. genuinely stuck, not just unlucky - so
  // ensurePlayable must revive it (never a whole-board reshuffle, SPEC 8.3).
  const { GEM_TYPES: TYPES, hasMatch: hasMatch3, hasAnyValidMove: hasAnyValidMove3, handleGameKey: handleGameKey3 } = loadMagicGems(
    [
      new URL('../../src/gems.js', import.meta.url),
      new URL('../../src/board.js', import.meta.url),
      new URL('../../src/interaction.js', import.meta.url),
      new URL('../../src/resolution.js', import.meta.url),
      new URL('../../src/game.js', import.meta.url),
    ],
    { randomQueue: [0.5 / 7, 1.5 / 7, 2.5 / 7] } // selects TYPES[0], TYPES[1], TYPES[2] in turn
  );
  const board = [
    [TYPES[0], TYPES[3], TYPES[4]],
    [TYPES[0], TYPES[5], TYPES[6]],
    [TYPES[2], TYPES[0], TYPES[1]],
  ];
  assert.equal(hasMatch3(board), false, 'sanity: fixture itself has no pre-existing match');

  const interaction = {
    cursor: { row: 2, col: 0 },
    selection: { row: 2, col: 0 },
    target: { row: 2, col: 1 },
  };
  const next = handleGameKey3({ board, interaction }, ' ');
  const stuckBoard = [
    [TYPES[0], TYPES[3], TYPES[4]],
    [TYPES[1], TYPES[5], TYPES[6]],
    [TYPES[2], TYPES[2], TYPES[1]],
  ];

  assert.equal(next.swapAnimation.matched, true, 'sanity: the swap must actually clear column 0');
  assert.equal(next.revived, true);
  assert.equal(next.board.length, 3, 'never a whole-board reshuffle - the board keeps its own size');
  // This exact fixture is known solvable with a single cell change - a real
  // orchestration bug (e.g. falling through to the two-cell fallback even when
  // the one-cell pass already succeeded) would still leave the board playable,
  // just via a non-minimal change, so the count itself is the only thing that
  // can catch that class of bug.
  assert.equal(next.changedCells.length, 1, 'expected exactly one changed cell for this fixture');
  for (const { row, col, gemType } of next.changedCells) {
    assert.equal(next.board[row][col], gemType, 'the changed cell must actually hold the type the revive reports');
  }
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (next.changedCells.some((c) => c.row === row && c.col === col)) continue;
      assert.equal(
        next.board[row][col],
        stuckBoard[row][col],
        `expected cell (${row},${col}) to be untouched by the revive`
      );
    }
  }
  assert.equal(hasAnyValidMove3(next.board), true, 'the revived board must have at least one valid move');
});
