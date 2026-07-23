(function (global) {
  'use strict';

  const { GEM_TYPES } = global.MagicGems;
  const { hasMatch } = global.MagicGems;

  const CASCADE_SAFETY_LIMIT = 20;
  const RESHUFFLE_SAFETY_LIMIT = 1000;

  function randomGem() {
    return GEM_TYPES[Math.floor(Math.random() * GEM_TYPES.length)];
  }

  function applySwap(board, a, b) {
    const next = board.map((row) => row.slice());
    const temp = next[a.row][a.col];
    next[a.row][a.col] = next[b.row][b.col];
    next[b.row][b.col] = temp;
    return next;
  }

  function markRun(matched, cells) {
    if (cells.length >= 3) {
      for (const { row, col } of cells) matched[row][col] = true;
    }
  }

  function findMatchedCells(board) {
    const size = board.length;
    const matched = Array.from({ length: size }, () => new Array(size).fill(false));

    for (let row = 0; row < size; row++) {
      let run = [{ row, col: 0 }];
      for (let col = 1; col <= size; col++) {
        const sameAsRunStart = col < size && board[row][col] === board[row][run[0].col];
        if (sameAsRunStart) {
          run.push({ row, col });
        } else {
          markRun(matched, run);
          run = [{ row, col }];
        }
      }
    }

    for (let col = 0; col < size; col++) {
      let run = [{ row: 0, col }];
      for (let row = 1; row <= size; row++) {
        const sameAsRunStart = row < size && board[row][col] === board[run[0].row][col];
        if (sameAsRunStart) {
          run.push({ row, col });
        } else {
          markRun(matched, run);
          run = [{ row, col }];
        }
      }
    }

    return matched;
  }

  function clearMatches(board, matched) {
    return board.map((row, r) => row.map((gem, c) => (matched[r][c] ? null : gem)));
  }

  function applyGravity(board) {
    const size = board.length;
    const next = Array.from({ length: size }, () => new Array(size).fill(null));

    for (let col = 0; col < size; col++) {
      const survivors = [];
      for (let row = 0; row < size; row++) {
        if (board[row][col] !== null) survivors.push(board[row][col]);
      }
      const gapCount = size - survivors.length;
      for (let row = 0; row < size; row++) {
        next[row][col] = row < gapCount ? null : survivors[row - gapCount];
      }
    }

    return next;
  }

  function refillBoard(board) {
    return board.map((row) => row.map((gem) => (gem === null ? randomGem() : gem)));
  }

  function hasAnyMatch(matched) {
    return matched.some((row) => row.some(Boolean));
  }

  function collectClearEvents(board, matched) {
    const events = [];
    for (let row = 0; row < board.length; row++) {
      for (let col = 0; col < board[row].length; col++) {
        if (matched[row][col]) events.push({ row, col, gemType: board[row][col] });
      }
    }
    return events;
  }

  function resolveCascade(board) {
    let current = board;
    const clearEvents = [];
    for (let i = 0; i < CASCADE_SAFETY_LIMIT; i++) {
      const matched = findMatchedCells(current);
      if (!hasAnyMatch(matched)) return { board: current, clearEvents };
      clearEvents.push(...collectClearEvents(current, matched));
      current = refillBoard(applyGravity(clearMatches(current, matched)));
    }
    return { board: current, clearEvents };
  }

  function hasAnyValidMove(board) {
    const size = board.length;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (col + 1 < size && hasMatch(applySwap(board, { row, col }, { row, col: col + 1 }))) {
          return true;
        }
        if (row + 1 < size && hasMatch(applySwap(board, { row, col }, { row: row + 1, col }))) {
          return true;
        }
      }
    }
    return false;
  }

  function ensurePlayable(board) {
    if (hasAnyValidMove(board)) return board;
    const { generateBoard } = global.MagicGems;
    let candidate = generateBoard();
    for (let i = 0; i < RESHUFFLE_SAFETY_LIMIT && !hasAnyValidMove(candidate); i++) {
      candidate = generateBoard();
    }
    return candidate;
  }

  global.MagicGems.applySwap = applySwap;
  global.MagicGems.findMatchedCells = findMatchedCells;
  global.MagicGems.clearMatches = clearMatches;
  global.MagicGems.applyGravity = applyGravity;
  global.MagicGems.refillBoard = refillBoard;
  global.MagicGems.resolveCascade = resolveCascade;
  global.MagicGems.hasAnyValidMove = hasAnyValidMove;
  global.MagicGems.ensurePlayable = ensurePlayable;
})(typeof window !== 'undefined' ? window : globalThis);
