// Per-move autoplay audit: for every move autoplay makes, record the grid
// before and after — as rendered pixels AND as logical state — then check three
// things independently:
//
//   1. the rendered grid before the move matches the logical grid before it
//   2. the swap autoplay chose is a valid move
//   3. the rendered grid after the move matches the logical grid after it
//
// Written because a defect was reported that every existing check was blind to:
// the suite asserts logical state and a single sound cue, so a board that draws
// something other than what it holds passes everything.
//
// Two design points that the rest of this file exists to protect:
//
// ATOMICITY. Every earlier attempt at this comparison read the state and the
// pixels in separate round trips, and autoplay completes a move roughly every
// 360ms — fast enough that a gap between two reads spans a move. Three separate
// "findings" turned out to be that gap. Here a single page.evaluate returns the
// animation flag, the logical board, the commit signal, the interaction state,
// the per-cell pixels AND the PNG of the same canvas. The image written to disk
// is therefore the exact frame the comparison was made against, not a
// re-screenshot taken afterwards.
//
// INDEPENDENCE. Move validity is decided here, not asked of the game. Adjacency
// and match detection are implemented in this file rather than imported from
// src/, so a wrong definition in the game cannot make its own moves look valid.
// The gem palette IS sampled from the live page — that is measuring what the
// renderer actually draws, which is the point, not an appeal to its opinion.
//
// Development only; never part of a deployment.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const URL = process.env.GAME_URL || 'http://127.0.0.1:3000';
const OUT_DIR = process.env.AUDIT_OUT || 'autoplay-audit';
const MAX_MOVES = Number(process.env.AUDIT_MOVES || 20);
const TIMEOUT_MS = Number(process.env.AUDIT_TIMEOUT_MS || 180000);
const POLL_MS = 25;
const BOARD_SIZE = 8;
const CLASSIFY_TOLERANCE = 40;

// ---------------------------------------------------------------------------
// Independent rules. Deliberately NOT imported from src/ — see INDEPENDENCE.
// ---------------------------------------------------------------------------
function isOrthogonallyAdjacent(a, b) {
  const dr = Math.abs(a.row - b.row);
  const dc = Math.abs(a.col - b.col);
  return dr + dc === 1;
}

function swapped(board, a, b) {
  const next = board.map((r) => r.slice());
  next[a.row][a.col] = board[b.row][b.col];
  next[b.row][b.col] = board[a.row][a.col];
  return next;
}

// A run of three or more identical gems in a row or column.
function matchedRuns(board) {
  const runs = [];
  const scan = (cells) => {
    let start = 0;
    for (let i = 1; i <= cells.length; i++) {
      if (i === cells.length || cells[i].type !== cells[start].type || cells[i].type === null) {
        if (i - start >= 3 && cells[start].type !== null) runs.push(cells.slice(start, i));
        start = i;
      }
    }
  };
  for (let row = 0; row < board.length; row++) {
    scan(board[row].map((type, col) => ({ row, col, type })));
  }
  for (let col = 0; col < board.length; col++) {
    scan(board.map((r, row) => ({ row, col, type: r[col] })));
  }
  return runs;
}

function colorDistance([r1, g1, b1], [r2, g2, b2]) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function classify(rgb, palette) {
  let best = null;
  let bestDistance = Infinity;
  for (const [gemType, reference] of Object.entries(palette)) {
    const d = colorDistance(rgb, reference);
    if (d < bestDistance) {
      bestDistance = d;
      best = gemType;
    }
  }
  return bestDistance <= CLASSIFY_TOLERANCE ? best : null;
}

function renderedGrid(cellPixels, palette) {
  return cellPixels.map((row) => row.map((rgba) => classify(rgba.slice(0, 3), palette)));
}

// Cells where what is drawn disagrees with what the game holds.
function gridMismatches(rendered, logical) {
  const out = [];
  for (let row = 0; row < logical.length; row++) {
    for (let col = 0; col < logical.length; col++) {
      if (rendered[row][col] !== logical[row][col]) {
        out.push({ row, col, rendered: rendered[row][col], logical: logical[row][col] });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The single atomic read. Everything compared comes from this one call.
// ---------------------------------------------------------------------------
const SNAPSHOT = ({ size }) => {
  const g = window.MagicGems;
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const cellW = canvas.width / size;
  const cellH = canvas.height / size;
  const cellPixels = [];
  for (let row = 0; row < size; row++) {
    const rowPixels = [];
    for (let col = 0; col < size; col++) {
      const cx = Math.round(col * cellW + cellW / 2);
      const cy = Math.round(row * cellH + cellH / 2);
      const [r, gr, b, a] = ctx.getImageData(cx, cy, 1, 1).data;
      rowPixels.push([r, gr, b, a]);
    }
    cellPixels.push(rowPixels);
  }
  return {
    animating: g.isAnimating(),
    board: g.getBoard().map((r) => r.slice()),
    soundLog: g.getSoundLog().slice(),
    interaction: JSON.parse(JSON.stringify(g.getInteractionState())),
    autoplayOn: g.isAutoplayOn(),
    cellPixels,
    png: canvas.toDataURL('image/png'),
  };
};

// A move ends when the game commits a swap. Every cursor step also writes to the
// sound log, so log growth alone marks a keypress, not a move — an earlier
// version of this file treated the two as the same and never once observed a
// swap. These two cues are written at commit, and they are the only entries that
// mean a swap actually happened.
const COMMIT_CUES = new Set(['swap', 'invalid']);

function commitCuesIn(log, fromIndex) {
  return log.slice(fromIndex).filter((cue) => COMMIT_CUES.has(cue));
}

// ---------------------------------------------------------------------------
// Positive control. A checker that cannot fail certifies nothing, and a clean
// audit run is only meaningful if these rules are known to reject what they
// should. Run with --self-test; also runs automatically before every audit.
// ---------------------------------------------------------------------------
function selfTest() {
  const failures = [];
  const check = (name, actual, expected) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  };
  const R = { row: 3, col: 3 };

  // Adjacency: exactly the four orthogonal neighbours, nothing else.
  for (const n of [{ row: 2, col: 3 }, { row: 4, col: 3 }, { row: 3, col: 2 }, { row: 3, col: 4 }]) {
    check(`adjacent ${n.row},${n.col}`, isOrthogonallyAdjacent(R, n), true);
  }
  for (const n of [{ row: 2, col: 2 }, { row: 4, col: 4 }, { row: 3, col: 5 }, { row: 3, col: 3 }]) {
    check(`not adjacent ${n.row},${n.col}`, isOrthogonallyAdjacent(R, n), false);
  }

  // Match detection: runs of three, in both directions, and no false positives.
  const flat = (rows) => rows.map((r) => r.split(''));
  check('no match on a clean board', matchedRuns(flat(['abab', 'baba', 'abab', 'baba'])).length, 0);
  check('pair is not a match', matchedRuns(flat(['aabb', 'bbaa', 'aabb', 'bbaa'])).length, 0);
  check('horizontal run of three', matchedRuns(flat(['aaab', 'baba', 'abab', 'baba'])).length, 1);
  // Every column here is deliberately distinct: an earlier version of this board
  // formed runs in two columns at once and the self-test caught it, which is
  // what a positive control is for.
  check('vertical run of three', matchedRuns(flat(['abcd', 'acbd', 'abce', 'dcbd'])).length, 1);

  // The whole point: an adjacent swap that forms nothing must be rejected.
  const board = flat(['abab', 'baba', 'abab', 'baba']);
  const a = { row: 0, col: 0 };
  const b = { row: 0, col: 1 };
  check('swap forming no match is rejected', matchedRuns(swapped(board, a, b)).length, 0);

  // Rendered-vs-logical: identical grids agree, a single altered cell does not.
  const logical = flat(['abab', 'baba', 'abab', 'baba']);
  check('identical grids report no mismatch', gridMismatches(logical, logical).length, 0);
  const altered = logical.map((r) => r.slice());
  altered[2][1] = 'z';
  check('one altered cell is caught', gridMismatches(altered, logical).length, 1);
  check('an unclassifiable cell is caught', gridMismatches([[null]], [['a']]).length, 1);

  return failures;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function snapshot(page) {
  return page.evaluate(SNAPSHOT, { size: BOARD_SIZE });
}

// Rendered and logical only agree once the board has settled: during a swap or
// cascade the renderer is deliberately mid-transition. Comparing at rest is a
// property of when the question is meaningful, not a way of avoiding an answer.
async function snapshotAtRest(page, deadline) {
  for (;;) {
    const s = await snapshot(page);
    if (!s.animating) return s;
    if (Date.now() > deadline) throw new Error('board never settled');
    await sleep(POLL_MS);
  }
}

async function writePng(dir, name, dataUrl) {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  await writeFile(join(dir, name), Buffer.from(base64, 'base64'));
}

// ---------------------------------------------------------------------------
async function main() {
  const selfTestFailures = selfTest();
  if (selfTestFailures.length) {
    console.error('SELF-TEST FAILED — the audit rules are wrong, so any result they produce is worthless:');
    for (const f of selfTestFailures) console.error(`  ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log('self-test: audit rules reject what they should\n');
  if (process.argv.includes('--self-test')) return;

  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const deadline = Date.now() + TIMEOUT_MS;

  await page.goto(URL);
  await page.click('#start-single-btn');
  await page.waitForFunction(() => {
    const c = document.getElementById('board');
    const g = window.MagicGems;
    return !!c && c.width > 0 && g && g.getSpriteImages && !!g.getSpriteImages();
  });

  // Sample each gem type through the page's own renderer at the real cell size:
  // the true on-screen colour rather than a guess at one.
  const palette = await page.evaluate(({ size }) => {
    const { GEM_TYPES, drawGem, getSpriteImages } = window.MagicGems;
    const canvas = document.getElementById('board');
    const cellSize = canvas.width / size;
    const sprites = getSpriteImages();
    const probe = document.createElement('canvas');
    probe.width = cellSize;
    probe.height = cellSize;
    const ctx = probe.getContext('2d');
    const half = Math.floor(cellSize / 2);
    const out = {};
    for (const gemType of GEM_TYPES) {
      ctx.clearRect(0, 0, cellSize, cellSize);
      drawGem(ctx, gemType, half, half, cellSize, sprites);
      const [r, g, b] = ctx.getImageData(half, half, 1, 1).data;
      out[gemType] = [r, g, b];
    }
    return out;
  }, { size: BOARD_SIZE });

  await page.keyboard.press('a');
  const moves = [];

  for (let index = 1; index <= MAX_MOVES && Date.now() < deadline; index++) {
    const before = await snapshotAtRest(page, deadline);

    // The swap pair is observed, not requested: the last poll before the commit
    // signal in which autoplay had both a selection and a target. Nothing here
    // asks the game which cells it decided to swap.
    let pending = null;
    let after = null;
    let gameCue = null;
    for (;;) {
      if (Date.now() > deadline) break;
      const s = await snapshot(page);
      if (s.interaction && s.interaction.selection && s.interaction.target) {
        pending = { selection: s.interaction.selection, target: s.interaction.target };
      }
      const cues = commitCuesIn(s.soundLog, before.soundLog.length);
      if (cues.length > 0) {
        gameCue = cues[0];
        after = await snapshotAtRest(page, deadline);
        break;
      }
      await sleep(POLL_MS);
    }
    if (!after) break;

    const dir = join(OUT_DIR, `move-${String(index).padStart(3, '0')}`);
    await mkdir(dir, { recursive: true });
    await writePng(dir, 'before.png', before.png);
    await writePng(dir, 'after.png', after.png);

    const renderedBefore = renderedGrid(before.cellPixels, palette);
    const renderedAfter = renderedGrid(after.cellPixels, palette);
    const beforeMismatches = gridMismatches(renderedBefore, before.board);
    const afterMismatches = gridMismatches(renderedAfter, after.board);

    let moveCheck;
    if (!pending) {
      moveCheck = { verdict: 'UNOBSERVED', reason: 'no selection/target pair seen before the commit' };
    } else {
      const { selection, target } = pending;
      const adjacent = isOrthogonallyAdjacent(selection, target);
      const runsAfterSwap = adjacent ? matchedRuns(swapped(before.board, selection, target)) : [];
      const verdict = adjacent && runsAfterSwap.length > 0 ? 'VALID' : 'INVALID';
      moveCheck = {
        verdict,
        selection,
        target,
        adjacent,
        formsMatch: runsAfterSwap.length > 0,
        matchedRuns: runsAfterSwap,
        // The game's own opinion, recorded but never used to decide the verdict
        // above. If these two ever disagree, that disagreement is itself the
        // finding: either this file's rules are wrong, or the game is calling a
        // move valid that isn't.
        gameCue,
        agreesWithGame: gameCue === null ? null : (gameCue === 'swap') === (verdict === 'VALID'),
      };
    }

    const record = {
      move: index,
      screenshots: { before: 'before.png', after: 'after.png' },
      gridBefore: before.board,
      gridAfter: after.board,
      renderedBefore,
      renderedAfter,
      checks: {
        renderedMatchesStateBefore: { pass: beforeMismatches.length === 0, mismatches: beforeMismatches },
        moveIsValid: moveCheck,
        renderedMatchesStateAfter: { pass: afterMismatches.length === 0, mismatches: afterMismatches },
      },
    };
    await writeFile(join(dir, 'move.json'), JSON.stringify(record, null, 2));
    moves.push(record);

    const flags = [
      beforeMismatches.length === 0 ? 'before:ok' : `before:MISMATCH(${beforeMismatches.length})`,
      `move:${moveCheck.verdict}`,
      afterMismatches.length === 0 ? 'after:ok' : `after:MISMATCH(${afterMismatches.length})`,
    ];
    console.log(`move ${String(index).padStart(3, '0')}  ${flags.join('  ')}`);
  }

  const failures = moves.filter(
    (m) =>
      !m.checks.renderedMatchesStateBefore.pass ||
      !m.checks.renderedMatchesStateAfter.pass ||
      m.checks.moveIsValid.verdict === 'INVALID'
  );
  const unobserved = moves.filter((m) => m.checks.moveIsValid.verdict === 'UNOBSERVED').length;

  await writeFile(
    join(OUT_DIR, 'summary.json'),
    JSON.stringify({ movesAudited: moves.length, failures: failures.length, unobservedMoves: unobserved, failingMoves: failures.map((f) => f.move) }, null, 2)
  );

  console.log(`\n  moves audited: ${moves.length}`);
  console.log(`  failures: ${failures.length}${failures.length ? ` (moves ${failures.map((f) => f.move).join(', ')})` : ''}`);
  console.log(`  moves whose swap could not be observed: ${unobserved}`);
  console.log(`  per-move screenshots and records: ${OUT_DIR}/\n`);

  await browser.close();
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
