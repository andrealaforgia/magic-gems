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
import { loadavg } from 'node:os';

const URL = process.env.GAME_URL || 'http://127.0.0.1:3000';
const OUT_DIR = process.env.AUDIT_OUT || 'autoplay-audit';
const MAX_MOVES = Number(process.env.AUDIT_MOVES || 20);
const TIMEOUT_MS = Number(process.env.AUDIT_TIMEOUT_MS || 180000);
const POLL_MS = 25;
const FRAME_MS = Number(process.env.AUDIT_FRAME_MS || 40);
const CAPTURE_FRAMES = process.env.AUDIT_FRAMES !== '0';
// AUDIT_FRAMES=0 was mislabelled "uninstrumented": it gates only the
// mid-animation frame reads, while every move still ran a 64-cell pixel read, a
// full canvas encode, a board and log copy, and two image writes to disk. So the
// 0.97 pacing ratio measured the marginal cost of frame capture ON TOP of all
// that, and said nothing about what the at-rest instrumentation itself costs -
// which matters, because 4.73s per move is several times the game's own
// animation budget. This mode is the genuinely light baseline: cue counting
// through the existing light poll, no snapshot, no pixels, no images, no disk.
const LIGHT_ONLY = process.env.AUDIT_LIGHT === '1';
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
    // Wall clock on every snapshot, frames or not. A passing revival rate shows
    // the instrument is not REMOVING events; it says nothing about whether it is
    // SLOWING the game, and a slowed game is a different environment from the one
    // a person watches. Without a per-move timestamp on every run there is no way
    // to compare pacing against an uninstrumented baseline afterwards.
    t: Math.round(performance.now()),
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

// The cheap read used while waiting for a move to complete. Reading every cell's
// pixels and serialising a PNG on a 25ms poll is heavy enough to change the
// thing being measured — instruments lighter than that demonstrably suppressed
// board revivals entirely earlier this week. Waiting needs only the commit
// signal and the interaction state, so the expensive read happens twice per
// move at rest rather than forty times per second throughout.
const PULSE = () => {
  const g = window.MagicGems;
  return {
    animating: g.isAnimating(),
    soundLog: g.getSoundLog().slice(),
    interaction: JSON.parse(JSON.stringify(g.getInteractionState())),
  };
};

// Everything above samples AT REST, and at rest the screen and the board agree
// by construction once a move has settled. A swap that is animated and then
// reverted leaves no trace at either endpoint: the board before and after are
// consistent and the committed move is valid, so every at-rest check passes
// while a person watching sees two gems exchange places for no reason.
//
// This captures the move itself. Only the canvas image and the phase, one call
// each - deliberately not the 64-cell pixel read, which is what made the
// original instrument heavy enough to suppress the events it needed to see.
const FRAME = () => {
  const g = window.MagicGems;
  const canvas = document.getElementById('board');
  return {
    t: Math.round(performance.now()),
    phase: g.getAnimationPhase(),
    animating: g.isAnimating(),
    png: canvas.toDataURL('image/png'),
  };
};

// A frame's own phase is null between named animation phases (e.g. the
// instant a swap finishes and before a cascade phase starts), and null was
// previously mislabelled "settled" regardless of whether anything was still
// moving - of frames landing in that bucket in one calibration run, the
// overwhelming majority were still-animating (falling shatter debris etc.)
// wearing a label that says nothing is happening, exactly the frames a
// person triaging by filename would skip. "Settled" is reserved for the one
// genuinely at-rest frame captured after a move's tail loop exits.
function frameLabel(f) {
  if (f.phase) return f.phase;
  return f.animating ? 'mid-animation' : 'settled';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function snapshot(page) {
  return page.evaluate(SNAPSHOT, { size: BOARD_SIZE });
}

async function pulse(page) {
  return page.evaluate(PULSE);
}

// Rendered and logical only agree once the board has settled: during a swap or
// cascade the renderer is deliberately mid-transition. Comparing at rest is a
// property of when the question is meaningful, not a way of avoiding an answer.
async function snapshotAtRest(page, deadline) {
  for (;;) {
    if ((await pulse(page)).animating === false) return snapshot(page);
    if (Date.now() > deadline) throw new Error('board never settled');
    await sleep(POLL_MS);
  }
}

async function writePng(dir, name, dataUrl) {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  await writeFile(join(dir, name), Buffer.from(base64, 'base64'));
}

// One full instrumented audit round: every per-move screenshot/frame/record
// this file has always produced, unchanged - pulled into its own function
// so it can be repeated for a variance estimate the same way the light
// baseline already is, without duplicating this much logic inline.
async function runInstrumentedRound(page, deadline, palette, outDir) {
  const moves = [];

  for (let index = 1; index <= MAX_MOVES && Date.now() < deadline; index++) {
    const before = await snapshotAtRest(page, deadline);

    // The swap pair is observed, not requested: the last poll before the commit
    // signal in which autoplay had both a selection and a target. Nothing here
    // asks the game which cells it decided to swap.
    let pending = null;
    let after = null;
    let gameCue = null;
    // Revivals are rare - roughly one move in a hundred - so a short run almost
    // certainly contains none. Recording this per move keeps the audit honest
    // about what it actually covered rather than letting a clean result over
    // ordinary swaps be read as coverage of the revive path too.
    let revived = false;
    const frames = [];
    for (;;) {
      if (Date.now() > deadline) break;
      if (CAPTURE_FRAMES) {
        const f = await page.evaluate(FRAME);
        if (f.animating || f.phase) frames.push(f);
      }
      const s = await pulse(page);
      if (s.interaction && s.interaction.selection && s.interaction.target) {
        pending = { selection: s.interaction.selection, target: s.interaction.target };
      }
      const newCues = s.soundLog.slice(before.soundLog.length);
      const cues = newCues.filter((cue) => COMMIT_CUES.has(cue));
      if (cues.length > 0) {
        gameCue = cues[0];
        revived = newCues.includes('reshuffle');
        while (CAPTURE_FRAMES && Date.now() < deadline) {
          const f = await page.evaluate(FRAME);
          frames.push(f);
          if (!f.animating) break;
          await sleep(FRAME_MS);
        }
        after = await snapshotAtRest(page, deadline);
        break;
      }
      await sleep(POLL_MS);
    }
    if (!after) break;

    const dir = join(outDir, `move-${String(index).padStart(3, '0')}`);
    await mkdir(dir, { recursive: true });
    await writePng(dir, 'before.png', before.png);
    await writePng(dir, 'after.png', after.png);
    for (let i = 0; i < frames.length; i++) {
      await writePng(dir, `frame-${String(i).padStart(3, '0')}-${frameLabel(frames[i])}.png`, frames[i].png);
    }

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
      revived,
      startedAt: before.t,
      endedAt: after.t,
      durationMs: after.t - before.t,
      screenshots: { before: 'before.png', after: 'after.png' },
      frames: frames.map((f, i) => ({ file: `frame-${String(i).padStart(3, '0')}-${frameLabel(f)}.png`, t: f.t, phase: f.phase, animating: f.animating })),
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

  // Named atRestFailures, not failures: every check here is at-rest (before-
  // mismatch, after-mismatch, move-invalid), and a clean result on these
  // three cannot be read as a verdict on the animated-then-reverted-swap
  // class this tool was built to look for - that class is defined as
  // leaving no trace at either endpoint, which is exactly what these three
  // conditions check. A clean run here means nothing about that class one
  // way or the other; it only means nothing wrong was caught at rest.
  const atRestFailures = moves.filter(
    (m) =>
      !m.checks.renderedMatchesStateBefore.pass ||
      !m.checks.renderedMatchesStateAfter.pass ||
      m.checks.moveIsValid.verdict === 'INVALID'
  );
  const failures = atRestFailures;
  const unobserved = moves.filter((m) => m.checks.moveIsValid.verdict === 'UNOBSERVED').length;
  // An unobserved move already falls into neither pass nor fail silently;
  // the same visibility gap applies to frames that exist but have not been
  // looked at by a person - every frame this run captured is, by
  // definition, unreviewed the moment this summary is written.
  const frameCount = moves.reduce((n, m) => n + m.frames.length, 0);
  const revivals = moves.filter((m) => m.revived).length;
  const spans = moves.filter((m) => Number.isFinite(m.durationMs) && m.durationMs > 0);
  const secondsPerMove = spans.length ? spans.reduce((n, m) => n + m.durationMs, 0) / spans.length / 1000 : null;

  await writeFile(
    join(outDir, 'summary.json'),
    JSON.stringify(
      {
        movesAudited: moves.length,
        atRestFailures: atRestFailures.length,
        unobservedMoves: unobserved,
        movesIncludingARevival: revivals,
        secondsPerMove,
        framesNotYetReviewed: frameCount,
        atRestFailingMoves: atRestFailures.map((f) => f.move),
      },
      null,
      2
    )
  );

  // A filmstrip per move so a person can scan the animation and point at a
  // specific frame. Every check in this file is at-rest; the frames exist for
  // the case those checks are structurally blind to, which is anything visible
  // only while a move is playing.
  const html = [
    '<meta charset="utf-8"><title>autoplay audit</title>',
    '<style>body{font:13px system-ui;background:#111;color:#ddd;margin:16px}',
    'h2{margin:24px 0 4px;font-size:15px}.s{color:#888;font-size:12px;margin-bottom:6px}',
    '.strip{display:flex;flex-wrap:wrap;gap:6px}figure{margin:0;text-align:center}',
    'img{width:150px;border:1px solid #333;display:block}',
    'figcaption{font-size:10px;color:#999;margin-top:2px}',
    '.swap figcaption{color:#ffb703}.bad{outline:2px solid #e63946}</style>',
    `<h1>autoplay audit — ${moves.length} moves, ${moves.reduce((n, m) => n + m.frames.length, 0)} frames</h1>`,
    '<p class="s">Frames labelled <b>swap</b> are the swap animation: the window every at-rest check is blind to. Point at a move number and frame number.</p>',
  ];
  for (const m of moves) {
    const dir = `move-${String(m.move).padStart(3, '0')}`;
    const v = m.checks.moveIsValid;
    const sel = v.selection ? `(${v.selection.row},${v.selection.col})->(${v.target.row},${v.target.col})` : 'unobserved';
    html.push(`<h2>move ${m.move} — swap ${sel} — ${v.verdict}${m.revived ? ' — REVIVAL' : ''}</h2>`);
    html.push(`<div class="s">before/after checks: ${m.checks.renderedMatchesStateBefore.pass ? 'ok' : 'MISMATCH'} / ${m.checks.renderedMatchesStateAfter.pass ? 'ok' : 'MISMATCH'}</div>`);
    html.push('<div class="strip">');
    html.push(`<figure><img src="${dir}/before.png"><figcaption>before (at rest)</figcaption></figure>`);
    for (const f of m.frames) {
      const cls = f.phase === 'swap' ? ' class="swap"' : '';
      html.push(`<figure${cls}><img src="${dir}/${f.file}"><figcaption>${f.file.slice(6, 9)} ${frameLabel(f)}</figcaption></figure>`);
    }
    html.push(`<figure><img src="${dir}/after.png"><figcaption>after (at rest)</figcaption></figure>`);
    html.push('</div>');
  }
  await writeFile(join(outDir, 'index.html'), html.join('\n'));

  console.log(`\n  moves audited: ${moves.length}`);
  console.log(`  AT-REST failures: ${failures.length}${failures.length ? ` (moves ${failures.map((f) => f.move).join(', ')})` : ''}`);
  console.log(`    ^ before/after render-vs-state and move validity ONLY. Says nothing about the animated window.`);
  if (frameCount) {
    // Move validity IS examined - the attempted swap's identity is polled live
    // during the move (not read off either endpoint) and independently
    // re-tested against the pre-move board, so an invalid attempt still gets
    // judged. Only the rendered FRAMES themselves - the pixels of the
    // animated window - go unexamined by any automated check.
    console.log(`  animated window: ${frameCount} frames captured, 0 examined by any automated check`);
    console.log(`    ^ the frames themselves, not the move: move validity above already covers the attempted swap. NOT a pass on the frames. Nobody has looked at these. Open ${outDir}/index.html.`);
  }
  console.log(`  moves whose swap could not be observed: ${unobserved}`);
  if (secondsPerMove !== null) {
    console.log(`  pacing: ${secondsPerMove.toFixed(2)}s per move  <- compare against an uninstrumented run before trusting any DURATION read off the frames`);
  }
  console.log(`  moves that included a board revival: ${revivals}${revivals ? '' : '  <- revive path NOT covered by this run'}`);
  console.log(`  per-move screenshots and records: ${outDir}/`);
  console.log(`  browsable filmstrip: ${outDir}/index.html\n`);

  return { movesAudited: moves.length, secondsPerMove, atRestFailures: atRestFailures.length, revivals };
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
  // The one difference never closed all week is that every instrument has run
  // in an automated browser while the defect was reported from a real one. An
  // instrument that cannot reproduce the environment cannot rule anything out
  // about it, so this is switchable rather than assumed: AUDIT_HEADED=1 runs a
  // visible browser at the real frame pacing a person actually watches.
  const headed = process.env.AUDIT_HEADED === '1';
  const browser = await chromium.launch({ headless: !headed, slowMo: 0 });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  if (headed) console.log('running HEADED — visible browser, real frame pacing\n');
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

  if (LIGHT_ONLY) {
    // A single run's pacing figure was confirmed unreliable: two identical
    // 40-move light runs on this machine produced a 12.9% swing - larger than
    // the 2-15% overhead the whole comparison exists to detect - because this
    // machine carries real, documented concurrent load that varies run to
    // run. A point figure can't tell real overhead from that noise. Several
    // independent runs and their SPREAD can: either the spread is small
    // enough that a comparison figure means something, or the spread itself
    // (reported honestly) is the finding - overhead is unmeasurable at this
    // sample on this machine, not a failure to produce a number.
    const RUNS = Number(process.env.AUDIT_LIGHT_RUNS || 4);
    const runs = [];
    for (let run = 1; run <= RUNS; run++) {
      const loadavgStart = loadavg();
      const started = Date.now();
      let seen = 0;
      let revivals = 0;
      let cursor = (await pulse(page)).soundLog.length;
      while (seen < MAX_MOVES && Date.now() < deadline) {
        const s2 = await pulse(page);
        const fresh = s2.soundLog.slice(cursor);
        const commits = fresh.filter((cue) => COMMIT_CUES.has(cue)).length;
        if (commits > 0) {
          seen += commits;
          if (fresh.includes('reshuffle')) revivals += 1;
          cursor = s2.soundLog.length;
        }
        await sleep(POLL_MS);
      }
      const elapsedSeconds = (Date.now() - started) / 1000;
      const secondsPerMove = elapsedSeconds / Math.max(seen, 1);
      const loadavgEnd = loadavg();
      runs.push({
        run,
        moves: seen,
        revivals,
        elapsedSeconds: Number(elapsedSeconds.toFixed(1)),
        secondsPerMove: Number(secondsPerMove.toFixed(3)),
        // 1-minute load average, the figure closest to "what was competing for
        // the CPU during this specific run" - recorded so a future large swing
        // can be attributed instead of re-discovered by another re-run.
        loadavg1mStart: Number(loadavgStart[0].toFixed(2)),
        loadavg1mEnd: Number(loadavgEnd[0].toFixed(2)),
      });
      console.log(`  run ${run}/${RUNS}: ${seen} moves, ${revivals} revivals, ${secondsPerMove.toFixed(2)}s/move, loadavg(1m) ${loadavgStart[0].toFixed(2)} -> ${loadavgEnd[0].toFixed(2)}`);
    }

    const paces = runs.map((r) => r.secondsPerMove);
    const min = Math.min(...paces);
    const max = Math.max(...paces);
    const spreadPercent = min > 0 ? ((max - min) / min) * 100 : null;

    console.log(`\n  LIGHT BASELINE across ${RUNS} runs — no pixel reads, no images, no disk writes per move`);
    console.log(`  pacing per run: ${paces.map((p) => p.toFixed(2)).join(', ')}s/move`);
    if (spreadPercent !== null) {
      console.log(`  spread: ${spreadPercent.toFixed(1)}% (min ${min.toFixed(2)}s, max ${max.toFixed(2)}s)`);
      console.log(`    ^ compare an instrumented run's pacing against this SPREAD, not a single point figure - if the spread itself is this large, overhead is unmeasurable at this sample on this machine\n`);
    }
    // Writing nothing to disk made this mode's own result unverifiable: the
    // figure existed only in whatever stdout someone happened to capture, and a
    // reviewer checking afterwards found no artefact and no running process, so
    // could neither confirm nor refute it. A measurement nobody else can check
    // is a recollection. One small summary file - still no pixels, no images,
    // no per-move records - so the number can be audited rather than believed.
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(
      join(OUT_DIR, 'light-baseline.json'),
      // schemaVersion 2: multi-round spread + loadavg (version 1 was a single
      // {mode, moves, revivals, elapsedSeconds, secondsPerMove} point figure,
      // indistinguishable from this shape by its "light" mode field alone -
      // a stale v1 artefact left on disk after this change landed was
      // mistakable for a fresh result until this field existed).
      JSON.stringify({ schemaVersion: 2, mode: 'light', generatedAt: new Date().toISOString(), runs, secondsPerMoveMin: min, secondsPerMoveMax: max, spreadPercent: spreadPercent === null ? null : Number(spreadPercent.toFixed(1)) }, null, 2)
    );
    console.log(`  summary written: ${OUT_DIR}/light-baseline.json\n`);
    await browser.close();
    return;
  }

  // The instrumented path's own pacing figure had the same single-run
  // problem the light baseline did: one number, no variance estimate, no
  // load context. AUDIT_INSTRUMENTED_RUNS repeats the full round (screenshots,
  // frames, and all) and reports the spread, the same way AUDIT_LIGHT_RUNS
  // already does for the light arm - default 1 preserves today's single-run
  // behaviour and output layout exactly for anyone not opting in.
  const INSTRUMENTED_ROUNDS = Number(process.env.AUDIT_INSTRUMENTED_RUNS || 1);
  const instrumentedRounds = [];
  for (let round = 1; round <= INSTRUMENTED_ROUNDS; round++) {
    const roundOutDir = INSTRUMENTED_ROUNDS > 1 ? join(OUT_DIR, `round-${round}`) : OUT_DIR;
    if (INSTRUMENTED_ROUNDS > 1) console.log(`\n=== round ${round}/${INSTRUMENTED_ROUNDS} ===`);
    const loadavgStart = loadavg();
    const result = await runInstrumentedRound(page, deadline, palette, roundOutDir);
    const loadavgEnd = loadavg();
    instrumentedRounds.push({
      round,
      ...result,
      loadavg1mStart: Number(loadavgStart[0].toFixed(2)),
      loadavg1mEnd: Number(loadavgEnd[0].toFixed(2)),
    });
  }

  if (INSTRUMENTED_ROUNDS > 1) {
    const paces = instrumentedRounds.map((r) => r.secondsPerMove).filter((p) => p !== null);
    const min = paces.length ? Math.min(...paces) : null;
    const max = paces.length ? Math.max(...paces) : null;
    const spreadPercent = min !== null && min > 0 ? ((max - min) / min) * 100 : null;
    console.log(`\n=== ${INSTRUMENTED_ROUNDS} instrumented rounds ===`);
    console.log(`  pacing per round: ${paces.map((p) => p.toFixed(2)).join(', ')}s/move`);
    if (spreadPercent !== null) {
      console.log(`  spread: ${spreadPercent.toFixed(1)}% (min ${min.toFixed(2)}s, max ${max.toFixed(2)}s)`);
      console.log(`    ^ compare against this SPREAD, not a single round's point figure\n`);
    }
    await writeFile(
      join(OUT_DIR, 'instrumented-rounds.json'),
      JSON.stringify({ schemaVersion: 1, mode: 'instrumented', generatedAt: new Date().toISOString(), rounds: instrumentedRounds, secondsPerMoveMin: min, secondsPerMoveMax: max, spreadPercent: spreadPercent === null ? null : Number(spreadPercent.toFixed(1)) }, null, 2)
    );
    console.log(`  summary written: ${OUT_DIR}/instrumented-rounds.json\n`);
  }

  await browser.close();
  process.exitCode = instrumentedRounds.some((r) => r.atRestFailures > 0) ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
