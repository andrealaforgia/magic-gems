import { test } from 'node:test';
import assert from 'node:assert';
import { loadMagicGems } from '../support/load-src.js';

const FILES = [
  new URL('../../src/gems.js', import.meta.url),
  new URL('../../src/seeded-random.js', import.meta.url),
  new URL('../../src/board.js', import.meta.url),
  new URL('../../src/interaction.js', import.meta.url),
  new URL('../../src/resolution.js', import.meta.url),
  new URL('../../src/game.js', import.meta.url),
];

function freshSandbox() {
  return loadMagicGems(FILES);
}

test('the same session code always produces byte-for-byte the same starting board (E2)', () => {
  const { activateSeededRandom: activateA, generateBoard: generateA } = freshSandbox();
  activateA('ABCDEFGHIJ');
  const boardA = generateA();

  const { activateSeededRandom: activateB, generateBoard: generateB } = freshSandbox();
  activateB('ABCDEFGHIJ');
  const boardB = generateB();

  assert.deepEqual(boardA, boardB);
});

test('two different session codes generally produce different starting boards', () => {
  const { activateSeededRandom: activateA, generateBoard: generateA } = freshSandbox();
  activateA('ABCDEFGHIJ');
  const boardA = generateA();

  const { activateSeededRandom: activateB, generateBoard: generateB } = freshSandbox();
  activateB('ZZZZZZZZZZ');
  const boardB = generateB();

  assert.notDeepEqual(boardA, boardB);
});

test('a seeded starting board still has no pre-existing run of 3+ (SPEC 4.2)', () => {
  const { activateSeededRandom, generateBoard, hasMatch } = freshSandbox();
  activateSeededRandom('ABCDEFGHIJ');
  const board = generateBoard();
  assert.equal(hasMatch(board), false);
});

test('restoreRealRandom hands control back to real randomness, not a still-frozen seeded sequence', () => {
  // Each sandbox activates with the SAME code, generates one (discarded)
  // seeded board, restores, then generates a second board. If restore()
  // actually works, that second board depends on real randomness and two
  // independent calls will essentially never match; if restore() were a
  // no-op, both sandboxes - having consumed the same number of prior draws
  // in lockstep - would keep drawing from the same seeded stream and match.
  function generateAfterRestore(code) {
    const { activateSeededRandom, generateBoard } = freshSandbox();
    const restore = activateSeededRandom(code);
    generateBoard();
    restore();
    return generateBoard();
  }

  const boardA = generateAfterRestore('ABCDEFGHIJ');
  const boardB = generateAfterRestore('ABCDEFGHIJ');

  assert.notDeepEqual(boardA, boardB, 'expected real randomness after restore, not a still-seeded sequence');
});

test('refills after a clear draw from the same seeded sequence on both clients, given the same move sequence (E3)', () => {
  // Fixture proven in resolution.test.js's own revive fixtures: (2,0)<->(2,1)
  // clears column 0's vertical run of 3 and triggers a refill.
  function playFixture(code) {
    const sandbox = freshSandbox();
    const { GEM_TYPES, activateSeededRandom, handleGameKey, createInteractionState } = sandbox;
    activateSeededRandom(code);
    const board = [
      [GEM_TYPES[0], GEM_TYPES[3], GEM_TYPES[4]],
      [GEM_TYPES[0], GEM_TYPES[5], GEM_TYPES[6]],
      [GEM_TYPES[2], GEM_TYPES[0], GEM_TYPES[1]],
    ];
    const interaction = {
      cursor: { row: 2, col: 0 },
      selection: { row: 2, col: 0 },
      target: { row: 2, col: 1 },
    };
    return handleGameKey({ board, interaction, exitConfirmOpen: false }, ' ').board;
  }

  const resultA = playFixture('SESSIONCODE');
  const resultB = playFixture('SESSIONCODE');

  assert.deepEqual(resultA, resultB, 'the same code + the same move must refill identically on independent clients');
});

test('a different session code generally refills differently for the exact same move (luck differs by code)', () => {
  function playFixture(code) {
    const sandbox = freshSandbox();
    const { GEM_TYPES, activateSeededRandom, handleGameKey } = sandbox;
    activateSeededRandom(code);
    const board = [
      [GEM_TYPES[0], GEM_TYPES[3], GEM_TYPES[4]],
      [GEM_TYPES[0], GEM_TYPES[5], GEM_TYPES[6]],
      [GEM_TYPES[2], GEM_TYPES[0], GEM_TYPES[1]],
    ];
    const interaction = {
      cursor: { row: 2, col: 0 },
      selection: { row: 2, col: 0 },
      target: { row: 2, col: 1 },
    };
    return handleGameKey({ board, interaction, exitConfirmOpen: false }, ' ').board;
  }

  const resultA = playFixture('SESSIONCODE');
  const resultB = playFixture('OTHERCODEXX');

  assert.notDeepEqual(resultA, resultB);
});
