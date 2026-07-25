(function (global) {
  'use strict';

  const { GEM_TYPES } = global.MagicGems;
  const SIZE = 8;

  function randomGem() {
    return GEM_TYPES[Math.floor(Math.random() * GEM_TYPES.length)];
  }

  function wouldMatchAt(board, row, col, gem) {
    if (col >= 2 && board[row][col - 1] === gem && board[row][col - 2] === gem) {
      return true;
    }
    if (row >= 2 && board[row - 1][col] === gem && board[row - 2][col] === gem) {
      return true;
    }
    return false;
  }

  function generateBoard() {
    const board = Array.from({ length: SIZE }, () => new Array(SIZE).fill(null));

    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        let gem;
        do {
          gem = randomGem();
        } while (wouldMatchAt(board, row, col, gem));
        board[row][col] = gem;
      }
    }

    return board;
  }

  // SPEC 13.3.1: two independent clients joined to the same session code must
  // build the identical starting board, and their subsequent refills must
  // draw from the same seeded sequence too - so Math.random stays replaced
  // until the caller explicitly restores it (covering not just this call's
  // own generateBoard(), but every later resolveCascade/ensurePlayable draw
  // this client's own match session makes), rather than only the one board.
  function activateSeededRandom(seedString) {
    const { hashStringToSeed, createSeededRandom } = global.MagicGems;
    const seededRandom = createSeededRandom(hashStringToSeed(seedString));
    const realRandom = Math.random;
    Math.random = seededRandom;
    return function restoreRealRandom() {
      Math.random = realRandom;
    };
  }

  function hasMatch(board) {
    const size = board.length;

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size - 2; col++) {
        const gem = board[row][col];
        if (gem === board[row][col + 1] && gem === board[row][col + 2]) {
          return true;
        }
      }
    }

    for (let col = 0; col < size; col++) {
      for (let row = 0; row < size - 2; row++) {
        const gem = board[row][col];
        if (gem === board[row + 1][col] && gem === board[row + 2][col]) {
          return true;
        }
      }
    }

    return false;
  }

  global.MagicGems.generateBoard = generateBoard;
  global.MagicGems.hasMatch = hasMatch;
  global.MagicGems.activateSeededRandom = activateSeededRandom;
})(typeof window !== 'undefined' ? window : globalThis);
