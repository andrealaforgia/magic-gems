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
})(typeof window !== 'undefined' ? window : globalThis);
