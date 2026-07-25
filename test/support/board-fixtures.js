const SIZE = 8;

// A deterministic, provably match-free 8x8 fixture: cell value cycles diagonally
// through all known gem types, so any 3 consecutive cells in a row or column always
// take 3 different residues mod GEM_TYPES.length (3 < length, no wraparound) — never
// a coincidental run of 3. Unlike generateBoard() + a 3-cell overwrite, this can
// never mask a broken detector behind an unrelated, incidental match elsewhere in
// the grid.
export function buildMatchFreeBoard(GEM_TYPES) {
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
export function buildStuckBoard(GEM_TYPES) {
  return [
    [GEM_TYPES[0], GEM_TYPES[1], GEM_TYPES[2]],
    [GEM_TYPES[1], GEM_TYPES[2], GEM_TYPES[0]],
    [GEM_TYPES[2], GEM_TYPES[0], GEM_TYPES[1]],
  ];
}

// A second stuck Latin square (same shape as buildStuckBoard, shifted to a
// different 3 of the 7 types) chosen so tryReviveTwoCells's very first candidate
// (cells (0,0)/(0,1), the first two GEM_TYPES) is genuinely rejected - it leaves
// the board still stuck (hasAnyValidMove false), forcing the search to actually
// advance past it. buildStuckBoard's own first candidate happens to already
// satisfy the postcondition (verified directly), which is exactly why a mutant
// that accepts unconditionally survived against it (QA review, commit 57dd1d6) -
// this fixture is the fix, not another copy of the same blind spot.
export function buildStuckBoardRequiringSearch(GEM_TYPES) {
  return [
    [GEM_TYPES[3], GEM_TYPES[4], GEM_TYPES[1]],
    [GEM_TYPES[4], GEM_TYPES[1], GEM_TYPES[3]],
    [GEM_TYPES[1], GEM_TYPES[3], GEM_TYPES[4]],
  ];
}
