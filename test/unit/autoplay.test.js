import { test } from 'node:test';
import assert from 'node:assert';
import { loadMagicGems } from '../support/load-src.js';
import {
  buildMatchFreeBoard as buildMatchFreeBoardFor,
  buildStuckBoard as buildStuckBoardFor,
} from '../support/board-fixtures.js';

const {
  GEM_TYPES,
  planAutoplaySteps,
  generateBoard,
  ensurePlayable,
  createInteractionState,
  handleGameKey,
  createSeededRandom,
} = loadMagicGems([
  new URL('../../src/gems.js', import.meta.url),
  new URL('../../src/board.js', import.meta.url),
  new URL('../../src/resolution.js', import.meta.url),
  new URL('../../src/interaction.js', import.meta.url),
  new URL('../../src/game.js', import.meta.url),
  new URL('../../src/autoplay.js', import.meta.url),
  new URL('../../src/seeded-random.js', import.meta.url),
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

// AUTOPLAY-RANDOM-CHOICE (SPEC 12.5): every scenario above plants exactly one
// valid move, so a deterministic "always pick the first" implementation
// would pass them all identically to a random one - this plants TWO
// independent moves in different corners and checks that repeated calls
// don't always return the same one.
test('planAutoplaySteps picks among ALL available valid moves at random, not always the same one (SPEC 12.5)', () => {
  const board = buildMatchFreeBoard();
  board[0][2] = GEM_TYPES[0];
  board[1][2] = GEM_TYPES[0];
  board[2][2] = GEM_TYPES[1];
  board[2][1] = GEM_TYPES[0];
  board[5][5] = GEM_TYPES[2];
  board[5][6] = GEM_TYPES[2];
  board[5][7] = GEM_TYPES[3];
  board[4][7] = GEM_TYPES[2];

  const seen = new Set();
  for (let i = 0; i < 100; i++) {
    seen.add(JSON.stringify(planAutoplaySteps(board, { row: 0, col: 0 })));
  }
  assert.ok(seen.size >= 2, `expected at least two distinct move choices across 100 trials, got ${seen.size}`);
});

// MP4-FIX class of bug: during a match, the ambient Math.random IS the
// session-seeded generator driving real refills (SPEC 13.3.1) - if move
// choice drew from it too, the opponent's own replica (whose mirrored seeded
// stream only ever advances via actually-replayed moves) would never see
// those extra draws, permanently desyncing every refill from that point on.
// Proves the seam that prevents it: an explicit randomFn is used for move
// choice, and the ambient Math.random is never touched.
test('planAutoplaySteps draws its move choice from an injected randomFn, never from the ambient Math.random (SPEC 12.5/MP4-FIX)', () => {
  const board = buildMatchFreeBoard();
  board[0][2] = GEM_TYPES[0];
  board[1][2] = GEM_TYPES[0];
  board[2][2] = GEM_TYPES[1];
  board[2][1] = GEM_TYPES[0];
  board[5][5] = GEM_TYPES[2];
  board[5][6] = GEM_TYPES[2];
  board[5][7] = GEM_TYPES[3];
  board[4][7] = GEM_TYPES[2];

  const originalMathRandom = Math.random;
  Math.random = () => {
    throw new Error('planAutoplaySteps must not touch the ambient Math.random when given an explicit randomFn');
  };
  try {
    let calls = 0;
    const injectedRandom = () => {
      calls++;
      return 0;
    };
    const steps = planAutoplaySteps(board, { row: 0, col: 0 }, injectedRandom);
    assert.ok(calls > 0, 'expected the injected randomFn to actually be called');
    assert.ok(steps.length > 0, 'expected a real move to still be planned');
  } finally {
    Math.random = originalMathRandom;
  }
});

// Owner report/AUTOPLAY-FIX (SPEC 12.2/6.5): every scenario above only checks
// planAutoplaySteps' own STRUCTURE against a hand-planted board with one
// known move - it never actually executes the plan and confirms the swap it
// produces really matches. That is exactly the class of gap the Owner
// flagged: an aggregate signal (score rising, a scenario "passing") can
// look correct while occasional individual swaps are invalid. This drives
// planAutoplaySteps end-to-end through handleGameKey across many
// generated boards and many moves per board, checking EVERY single
// committed swap, not a sample - a fixed seed per trial keeps this fully
// reproducible in CI while still covering a wide range of real board
// states (including whatever revive/reshuffle states arise along the way).
// Local to this test only - swaps Math.random for the duration of fn so a
// seeded generator drives board generation/refills reproducibly. Not a
// production seam: nothing in src/ needs this anymore now that remote sync
// is a direct snapshot draw rather than a seeded replay (MP-SYNC-SNAPSHOT).
function withSeededRandom(seededRandom, fn) {
  const previous = Math.random;
  Math.random = seededRandom;
  try {
    return fn();
  } finally {
    Math.random = previous;
  }
}

test('every move planAutoplaySteps produces, once actually played through handleGameKey, is a real match', () => {
  const TRIALS = 300;
  const MOVES_PER_TRIAL = 60;
  let totalMoves = 0;

  for (let trial = 0; trial < TRIALS; trial++) {
    const seededRandom = createSeededRandom(trial);
    let board, interaction;
    withSeededRandom(seededRandom, () => {
      board = ensurePlayable(generateBoard()).board;
      interaction = createInteractionState();
    });

    for (let move = 0; move < MOVES_PER_TRIAL; move++) {
      const plan = planAutoplaySteps(board, interaction.cursor);
      assert.ok(plan.length > 0, `trial ${trial} move ${move}: expected a valid move to always be available (SPEC 8.3)`);

      let matched = null;
      for (const key of plan) {
        const next = withSeededRandom(seededRandom, () => handleGameKey({ board, interaction, exitConfirmOpen: false }, key));
        if (next.swapAnimation) matched = next.swapAnimation.matched;
        board = next.board;
        interaction = next.interaction;
      }
      totalMoves++;
      assert.equal(matched, true, `trial ${trial} move ${move}: autoplay committed a swap that did not produce a match`);
    }
  }

  assert.equal(totalMoves, TRIALS * MOVES_PER_TRIAL, 'sanity check: every planned move must have actually run');
});
