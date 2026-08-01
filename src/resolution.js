(function (global) {
  'use strict';

  const { GEM_TYPES } = global.MagicGems;
  const { hasMatch } = global.MagicGems;

  const CASCADE_SAFETY_LIMIT = 20;

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

  function markRun(matched, cells, runLengths) {
    if (cells.length >= 3) {
      for (const { row, col } of cells) matched[row][col] = true;
      runLengths.push(cells.length);
    }
  }

  // runLengths lists every qualifying run's own length (one entry per run, not per
  // cell) - the scoring system (SPEC 10.3/10.4) needs each run's individual length
  // to compute its own base points before summing, which the boolean matched grid
  // alone can't distinguish (it can't tell a lone 5-run from a 3-run and a 4-run
  // that happen to touch).
  function findMatchedCells(board) {
    const size = board.length;
    const matched = Array.from({ length: size }, () => new Array(size).fill(false));
    const runLengths = [];

    for (let row = 0; row < size; row++) {
      let run = [{ row, col: 0 }];
      for (let col = 1; col <= size; col++) {
        const sameAsRunStart = col < size && board[row][col] === board[row][run[0].col];
        if (sameAsRunStart) {
          run.push({ row, col });
        } else {
          markRun(matched, run, runLengths);
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
          markRun(matched, run, runLengths);
          run = [{ row, col }];
        }
      }
    }

    return { matched, runLengths };
  }

  function clearMatches(board, matched) {
    return board.map((row, r) => row.map((gem, c) => (matched[r][c] ? null : gem)));
  }

  function applyGravity(board) {
    const size = board.length;
    const next = Array.from({ length: size }, () => new Array(size).fill(null));
    const fallEvents = [];

    for (let col = 0; col < size; col++) {
      const survivors = [];
      for (let row = 0; row < size; row++) {
        if (board[row][col] !== null) survivors.push({ row, gemType: board[row][col] });
      }
      const gapCount = size - survivors.length;
      for (let row = 0; row < size; row++) {
        if (row < gapCount) {
          next[row][col] = null;
        } else {
          const survivor = survivors[row - gapCount];
          next[row][col] = survivor.gemType;
          if (survivor.row !== row) {
            fallEvents.push({ col, fromRow: survivor.row, toRow: row, gemType: survivor.gemType });
          }
        }
      }
    }

    return { board: next, fallEvents };
  }

  function refillBoard(board) {
    const size = board.length;
    const next = board.map((row) => row.slice());
    const refillEvents = [];

    for (let col = 0; col < size; col++) {
      const gapCount = next.reduce((count, row) => count + (row[col] === null ? 1 : 0), 0);
      for (let row = 0; row < size; row++) {
        if (next[row][col] === null) {
          const gemType = randomGem();
          next[row][col] = gemType;
          refillEvents.push({ col, row, gemType, startRow: row - gapCount });
        }
      }
    }

    return { board: next, refillEvents };
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
    const steps = [];
    for (let i = 0; i < CASCADE_SAFETY_LIMIT; i++) {
      const { matched, runLengths } = findMatchedCells(current);
      if (!hasAnyMatch(matched)) return { board: current, steps };
      const clearEvents = collectClearEvents(current, matched);
      const { board: fallen, fallEvents } = applyGravity(clearMatches(current, matched));
      const { board: refilled, refillEvents } = refillBoard(fallen);
      steps.push({ boardBeforeStep: current, clearEvents, fallEvents, refillEvents, runLengths });
      current = refilled;
    }
    return { board: current, steps };
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

  // SPEC 12.2: same search as hasAnyValidMove, but returns the actual pair to
  // swap (raster order, first found) rather than just whether one exists - what
  // autoplay needs to actually emulate the move, not merely confirm one is possible.
  function findValidMove(board) {
    const size = board.length;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const a = { row, col };
        if (col + 1 < size) {
          const b = { row, col: col + 1 };
          if (hasMatch(applySwap(board, a, b))) return { a, b };
        }
        if (row + 1 < size) {
          const b = { row: row + 1, col };
          if (hasMatch(applySwap(board, a, b))) return { a, b };
        }
      }
    }
    return null;
  }

  // SPEC 12.5: same exhaustive search as findValidMove, but collects EVERY
  // valid pair instead of stopping at the first - AUTOPLAY-RANDOM-CHOICE
  // picks uniformly among these rather than always the raster-order-first one.
  function findAllValidMoves(board) {
    const size = board.length;
    const moves = [];
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const a = { row, col };
        if (col + 1 < size) {
          const b = { row, col: col + 1 };
          if (hasMatch(applySwap(board, a, b))) moves.push({ a, b });
        }
        if (row + 1 < size) {
          const b = { row: row + 1, col };
          if (hasMatch(applySwap(board, a, b))) moves.push({ a, b });
        }
      }
    }
    return moves;
  }

  function shuffled(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function allCells(size) {
    const cells = [];
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) cells.push({ row, col });
    }
    return cells;
  }

  function orthogonalNeighbors(size, row, col) {
    const neighbors = [];
    if (row > 0) neighbors.push({ row: row - 1, col });
    if (row < size - 1) neighbors.push({ row: row + 1, col });
    if (col > 0) neighbors.push({ row, col: col - 1 });
    if (col < size - 1) neighbors.push({ row, col: col + 1 });
    return neighbors;
  }

  // SPEC 8.3 (the Owner's own stated requirement, AUTOPLAY-INVALID-MOVE fix):
  // a randomly selected reference gem has one of its adjacent neighbours
  // (never a diagonal) turned into the reference's own type - a legible,
  // visible pair forming, not an arbitrary independent substitution. Only the
  // transformed neighbour changed, so only it is reported in changedCells and
  // rotates - the reference gem itself never changes and must not rotate
  // (examiner correction: "every changed gem rotates", not both). Tried
  // exhaustively, just in random order, so a solution is found whenever one
  // exists anywhere on the board, not only for whichever reference happens to
  // be drawn first.
  function tryReviveByAdjacentPair(board) {
    const size = board.length;
    for (const ref of shuffled(allCells(size))) {
      const gemType = board[ref.row][ref.col];
      for (const neighbor of shuffled(orthogonalNeighbors(size, ref.row, ref.col))) {
        if (board[neighbor.row][neighbor.col] === gemType) continue;
        const candidate = board.map((r) => r.slice());
        candidate[neighbor.row][neighbor.col] = gemType;
        if (!hasMatch(candidate) && hasAnyValidMove(candidate)) {
          return {
            board: candidate,
            changedCells: [{ row: neighbor.row, col: neighbor.col, gemType }],
          };
        }
      }
    }
    return null;
  }

  // SPEC 8.3.2: the escalation the Owner described for when a single
  // same-type neighbour isn't enough on its own - a further gem, still the
  // SAME type as the reference (never an independent second type), is placed
  // wherever it needs to be for the pair to actually unlock a legal swap; no
  // adjacency is required of this further gem, only the type match and the
  // legality it produces. Same reference/neighbour search as
  // tryReviveByAdjacentPair, since the neighbour transformation always
  // happens first; only the further gem's position varies, searched
  // exhaustively (in random order) across the rest of the board. As above,
  // only the two cells that actually changed - never the reference - are
  // reported and rotate.
  function tryReviveByAdjacentPairEscalation(board) {
    const size = board.length;
    for (const ref of shuffled(allCells(size))) {
      const gemType = board[ref.row][ref.col];
      for (const neighbor of shuffled(orthogonalNeighbors(size, ref.row, ref.col))) {
        if (board[neighbor.row][neighbor.col] === gemType) continue;
        const withNeighbor = board.map((r) => r.slice());
        withNeighbor[neighbor.row][neighbor.col] = gemType;
        if (hasMatch(withNeighbor)) continue;
        for (const further of shuffled(allCells(size))) {
          const isRef = further.row === ref.row && further.col === ref.col;
          const isNeighbor = further.row === neighbor.row && further.col === neighbor.col;
          if (isRef || isNeighbor || withNeighbor[further.row][further.col] === gemType) continue;
          const candidate = withNeighbor.map((r) => r.slice());
          candidate[further.row][further.col] = gemType;
          if (!hasMatch(candidate) && hasAnyValidMove(candidate)) {
            return {
              board: candidate,
              changedCells: [
                { row: neighbor.row, col: neighbor.col, gemType },
                { row: further.row, col: further.col, gemType },
              ],
            };
          }
        }
      }
    }
    return null;
  }

  // Absolute last resort, practically unreachable (no board this game has ever
  // produced needs more than a two-cell revive) - keeps changing one further
  // cell at a time until a valid move exists, rather than looping forever if
  // both smaller passes above somehow failed.
  function reviveByIncrementalChange(board) {
    const size = board.length;
    let candidate = board.map((r) => r.slice());
    const changedCells = [];
    for (let i = 0; i < size * size; i++) {
      const row = Math.floor(i / size);
      const col = i % size;
      const original = candidate[row][col];
      for (const gemType of GEM_TYPES) {
        if (gemType === original) continue;
        const attempt = candidate.map((r) => r.slice());
        attempt[row][col] = gemType;
        if (hasMatch(attempt)) continue;
        candidate = attempt;
        changedCells.push({ row, col, gemType });
        if (hasAnyValidMove(candidate)) return { board: candidate, changedCells };
        break;
      }
    }
    throw new Error('reviveByIncrementalChange: exhausted every cell without finding a valid move');
  }

  function ensurePlayable(board) {
    if (hasAnyValidMove(board)) return { board, changedCells: [] };
    return (
      tryReviveByAdjacentPair(board) || tryReviveByAdjacentPairEscalation(board) || reviveByIncrementalChange(board)
    );
  }

  global.MagicGems.applySwap = applySwap;
  global.MagicGems.findMatchedCells = findMatchedCells;
  global.MagicGems.clearMatches = clearMatches;
  global.MagicGems.applyGravity = applyGravity;
  global.MagicGems.refillBoard = refillBoard;
  global.MagicGems.resolveCascade = resolveCascade;
  global.MagicGems.hasAnyValidMove = hasAnyValidMove;
  global.MagicGems.findValidMove = findValidMove;
  global.MagicGems.findAllValidMoves = findAllValidMoves;
  global.MagicGems.ensurePlayable = ensurePlayable;
  global.MagicGems.tryReviveByAdjacentPair = tryReviveByAdjacentPair;
  global.MagicGems.tryReviveByAdjacentPairEscalation = tryReviveByAdjacentPairEscalation;
  global.MagicGems.reviveByIncrementalChange = reviveByIncrementalChange;
})(typeof window !== 'undefined' ? window : globalThis);
