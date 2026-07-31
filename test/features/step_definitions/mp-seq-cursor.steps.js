import { After, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { findHighlight } from './interaction.steps.js';
import { CLASSIFY_TOLERANCE } from '../support/pixel-utils.js';

function pageFor(world, which) {
  return which === 'first' ? world.pageA : world.pageB;
}

const REMOTE_CANVAS_ID = 'match-remote-board';
const BOARD_SIZE = 8;

// QA review (Farley Index, MP-SEQ-CURSOR): named once so a poll's own retry
// cadence and the Cucumber step timeout that bounds it can't silently drift
// apart - the step timeout is always this deadline plus a fixed margin.
const REMOTE_POLL_INTERVAL_MS = 200;
const REMOTE_POLL_DEADLINE_MS = 20000;
const REMOTE_STEP_TIMEOUT_MS = REMOTE_POLL_DEADLINE_MS + 5000;
// QA review: named and justified, not a bare literal - ordinary scheduling/
// frame jitter on this path is single digits to low tens of milliseconds
// (production advances the remote cursor by at most one step per animation
// frame, ~16ms typical); this margin sits an order of magnitude above that,
// so a fixed-cadence implementation (which would produce two near-equal
// durations regardless of the real gap between moves) could not clear it by
// chance alone.
const PACE_DISTINGUISHABILITY_MARGIN_MS = 200;

// QA review: one shared "poll until predicate" primitive instead of two
// near-duplicate loops - the highlight check and the cursor-trail check both
// reduce to "keep sampling until this is true, or say what was last seen."
async function pollUntil(sample, predicate, describeLast) {
  const deadline = Date.now() + REMOTE_POLL_DEADLINE_MS;
  let last = await sample();
  while (Date.now() < deadline && !predicate(last)) {
    await new Promise((resolve) => setTimeout(resolve, REMOTE_POLL_INTERVAL_MS));
    last = await sample();
  }
  assert.ok(predicate(last), describeLast(last));
  return last;
}

// MP-SEQ-CURSOR/SPEC 13.4.5.2-13.4.5.3: reads the RECEIVING page's own remote
// canvas - the same pixel-level highlight reader single-player's local board
// already uses (interaction.steps.js), pointed at the multiplayer remote
// canvas instead - so this proves the opponent's cursor/selection/target are
// actually drawn on screen, not just present in the polled wire state.
async function waitForRemoteHighlight(page, type, row, col) {
  await pollUntil(
    () => findHighlight(page, type, REMOTE_CANVAS_ID),
    (found) => found.length === 1 && found[0].row === row && found[0].col === col,
    (found) => `expected the remote ${type} highlight to reach cell ${row},${col}, last saw ${JSON.stringify(found)}`
  );
}

Then(
  "the {word} page's remote cursor highlight eventually is at cell {int},{int}",
  { timeout: REMOTE_STEP_TIMEOUT_MS },
  async function (which, row, col) {
    await waitForRemoteHighlight(pageFor(this, which), 'cursor', row, col);
  }
);

Then(
  "the {word} page's remote selection highlight eventually is at cell {int},{int}",
  { timeout: REMOTE_STEP_TIMEOUT_MS },
  async function (which, row, col) {
    await waitForRemoteHighlight(pageFor(this, which), 'selection', row, col);
  }
);

Then(
  "the {word} page's remote target highlight eventually is at cell {int},{int}",
  { timeout: REMOTE_STEP_TIMEOUT_MS },
  async function (which, row, col) {
    await waitForRemoteHighlight(pageFor(this, which), 'target', row, col);
  }
);

// SPEC 13.4.5.2/E2 (corrected): a demonstration that only confirms the
// remote cursor eventually ARRIVES at the right cell can't distinguish real
// cell-by-cell travel from a direct jump - it has to show the cells in
// between. Polling the remote canvas from OUTSIDE the page (Node-side
// setTimeout) can miss a cell that's only drawn for a moment if the host
// machine is ever under load - a real risk here, since the Reaper/Courier/QA/
// Warden observers and this same suite's own other real-browser scenarios
// can run concurrently. So the sampling itself runs INSIDE the page, driven
// by requestAnimationFrame - the exact same clock the drawing itself runs
// on - which means a sample is taken on (or immediately after) every frame
// that could possibly have changed what's drawn, independent of how slow or
// backed-up the Node/Playwright side is at that moment.
async function startRemoteCursorTrail(page) {
  await page.evaluate(
    ({ canvasId, size, tolerance }) => {
      function hexToRgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      }
      function colorDistance([r1, g1, b1], [r2, g2, b2]) {
        return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
      }
      function classify(rgb, palette) {
        let best = null;
        let bestDist = Infinity;
        for (const [key, hex] of Object.entries(palette)) {
          const d = colorDistance(rgb, hexToRgb(hex));
          if (d < bestDist) {
            bestDist = d;
            best = key;
          }
        }
        return bestDist < tolerance ? best : null;
      }
      const canvas = document.getElementById(canvasId);
      const ctx = canvas.getContext('2d');
      const cellSize = canvas.width / size;
      const inset = window.MagicGems.HIGHLIGHT_RING_INSET;
      const palette = window.MagicGems.HIGHLIGHT_COLORS;
      window.__mpSeqCursorTrail__ = [];
      function sample() {
        // A real gem's own sprite colour can coincidentally fall within the
        // classify tolerance of the cursor highlight colour at this exact
        // inset sample point, purely by chance of the board's own random
        // fill - the SAME risk findHighlight (interaction.steps.js) already
        // guards against by requiring EXACTLY one match, not just the first
        // one scanned. Recording the first match without that check once
        // produced a false "cursor at a cell it was never drawn at all"
        // reading. So this scans the WHOLE board every frame and only
        // records a cell when precisely one match is found - any other
        // count (zero, or more than one) is treated as "no reliable reading
        // this frame" and simply skipped, never guessed at.
        const matches = [];
        for (let row = 0; row < size; row++) {
          for (let col = 0; col < size; col++) {
            const x = Math.round(col * cellSize + inset);
            const y = Math.round(row * cellSize + cellSize / 2);
            const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
            if (classify([r, g, b], palette) === 'cursor') matches.push({ row, col });
          }
        }
        if (matches.length === 1) {
          const trail = window.__mpSeqCursorTrail__;
          const last = trail[trail.length - 1];
          const found = matches[0];
          // atMs is this PAGE's own performance.now() at the moment this
          // cell was first seen drawn - used to measure real on-screen pace
          // (Owner extension) entirely from this one page-side clock, never
          // comparing timestamps across the two pages' own separate clocks.
          if (!last || last.row !== found.row || last.col !== found.col) {
            trail.push({ row: found.row, col: found.col, atMs: performance.now() });
          }
        }
        window.__mpSeqCursorTrailRafId__ = requestAnimationFrame(sample);
      }
      window.__mpSeqCursorTrailRafId__ = requestAnimationFrame(sample);
    },
    { canvasId: REMOTE_CANVAS_ID, size: BOARD_SIZE, tolerance: CLASSIFY_TOLERANCE }
  );
}

async function readRemoteCursorTrail(page) {
  return page.evaluate(() => window.__mpSeqCursorTrail__ || []);
}

async function stopRemoteCursorTrail(page) {
  await page
    .evaluate(() => {
      if (window.__mpSeqCursorTrailRafId__) cancelAnimationFrame(window.__mpSeqCursorTrailRafId__);
    })
    .catch(() => {
      // the page may already be gone (scenario teardown) - nothing to clean up then
    });
}

// QA review/Examiner verdict (both independently, MP-SEQ-CURSOR): a stop
// only wired into the matching Then's own finally leaves the poller running
// for the rest of the scenario if an EARLIER step throws first, since that
// Then then never runs. Tracking every page a trail was started on lets this
// file's own After hook (below) stop all of them regardless of which step
// failed - the finally block below is still the FAST path (stops the poller
// the moment its own assertion is done); this is the fallback that fires
// even when that path is skipped entirely.
let pagesWithActiveTrails = [];

Given("I record the {word} page's own remote cursor trail", async function (which) {
  const page = pageFor(this, which);
  await startRemoteCursorTrail(page);
  pagesWithActiveTrails.push(page);
});

After(async function () {
  await Promise.all(pagesWithActiveTrails.map((page) => stopRemoteCursorTrail(page)));
  pagesWithActiveTrails = [];
});

// QA review: the settle-and-cleanup scaffolding (poll until the trail's own
// last entry is the expected resting cell, then always stop the poller) was
// duplicated across the two "passed through" Then defs below - factored out
// so each of those keeps only the assertion that's actually distinct between
// them.
async function waitForTrailSettledAt(world, which, finalRow, finalCol, onSettled) {
  const page = pageFor(world, which);
  try {
    const trail = await pollUntil(
      () => readRemoteCursorTrail(page),
      (t) => {
        const last = t[t.length - 1];
        return Boolean(last && last.row === finalRow && last.col === finalCol);
      },
      (t) => `expected the remote cursor trail to settle at cell ${finalRow},${finalCol}, got ${JSON.stringify(t)}`
    );
    onSettled(trail);
  } finally {
    await stopRemoteCursorTrail(page);
    pagesWithActiveTrails = pagesWithActiveTrails.filter((p) => p !== page);
  }
}

Then(
  "the {word} page's own remote cursor trail eventually shows cell {int},{int} as the resting position, having passed through cell {int},{int} along the way",
  { timeout: REMOTE_STEP_TIMEOUT_MS },
  async function (which, finalRow, finalCol, midRow, midCol) {
    await waitForTrailSettledAt(this, which, finalRow, finalCol, (trail) => {
      const passedThroughMid = trail.some((cell) => cell.row === midRow && cell.col === midCol);
      assert.ok(
        passedThroughMid,
        `expected the remote cursor trail to pass through cell ${midRow},${midCol} on its way to ${finalRow},${finalCol} (not jump straight there), got ${JSON.stringify(trail)}`
      );
    });
  }
);

// Owner extension to E2: true-path fidelity - a reconstructed shortcut
// between two endpoints (e.g. row-first when the real move went column-
// first) can pass a mere "never jumps" check while still showing cells the
// opponent never actually visited. Checking that TWO specific cells both
// appear, IN THAT ORDER, discriminates a faithful replay from a shortcut: an
// L-shaped move (e.g. two ArrowRight then two ArrowDown) visits a corner
// cell a row-first-then-column reconstruction between the same two
// endpoints would never produce at all.
Then(
  "the {word} page's own remote cursor trail eventually shows cell {int},{int} as the resting position, having passed through cell {int},{int} then cell {int},{int} along the way",
  { timeout: REMOTE_STEP_TIMEOUT_MS },
  async function (which, finalRow, finalCol, firstMidRow, firstMidCol, secondMidRow, secondMidCol) {
    await waitForTrailSettledAt(this, which, finalRow, finalCol, (trail) => {
      const firstMidIndex = trail.findIndex((cell) => cell.row === firstMidRow && cell.col === firstMidCol);
      const secondMidIndex = trail.findIndex((cell) => cell.row === secondMidRow && cell.col === secondMidCol);
      assert.ok(
        firstMidIndex !== -1,
        `expected the remote cursor trail to pass through cell ${firstMidRow},${firstMidCol}, got ${JSON.stringify(trail)}`
      );
      assert.ok(
        secondMidIndex !== -1,
        `expected the remote cursor trail to pass through cell ${secondMidRow},${secondMidCol}, got ${JSON.stringify(trail)}`
      );
      assert.ok(
        firstMidIndex < secondMidIndex,
        `expected cell ${firstMidRow},${firstMidCol} to be visited BEFORE cell ${secondMidRow},${secondMidCol} (the real order, not a shortcut), got ${JSON.stringify(trail)}`
      );
    });
  }
);

// Owner extension to E2: pace fidelity - manufactures a real wall-clock gap
// before the NEXT key press, so a "slow" move's own recorded dtMs (main.js's
// own recordCursorMove) is genuinely larger than a "fast" one's, entirely
// through real elapsed time rather than a fabricated value.
When('I wait {int}ms before continuing on the {word} page', async function (ms, which) {
  await pageFor(this, which).waitForTimeout(ms);
});

// Owner extension to E2, the discriminator itself: reads the two arrival
// timestamps for each named move (both already recorded by the SAME page's
// own performance.now(), in startRemoteCursorTrail above - never comparing
// across the two pages' separate clocks) and asserts the slow move's own
// on-screen duration meaningfully exceeds the fast one's - proving the
// receiving client reproduces the sender's real pace rather than a fixed
// per-cell cadence that would normalize both to roughly the same duration.
Then(
  "the {word} page's own remote cursor trail shows the move from cell {int},{int} to cell {int},{int} taking meaningfully longer than the move from cell {int},{int} to cell {int},{int}",
  { timeout: REMOTE_STEP_TIMEOUT_MS },
  async function (which, slowFromRow, slowFromCol, slowToRow, slowToCol, fastFromRow, fastFromCol, fastToRow, fastToCol) {
    const page = pageFor(this, which);
    try {
      const trail = await pollUntil(
        () => readRemoteCursorTrail(page),
        (t) => t.some((cell) => cell.row === slowToRow && cell.col === slowToCol),
        (t) => `expected the remote cursor trail to eventually reach cell ${slowToRow},${slowToCol}, got ${JSON.stringify(t)}`
      );
      function atMsFor(row, col) {
        const entry = trail.find((cell) => cell.row === row && cell.col === col);
        assert.ok(entry, `expected the remote cursor trail to contain cell ${row},${col}, got ${JSON.stringify(trail)}`);
        return entry.atMs;
      }
      const slowDurationMs = atMsFor(slowToRow, slowToCol) - atMsFor(slowFromRow, slowFromCol);
      const fastDurationMs = atMsFor(fastToRow, fastToCol) - atMsFor(fastFromRow, fastFromCol);
      assert.ok(
        slowDurationMs > fastDurationMs + PACE_DISTINGUISHABILITY_MARGIN_MS,
        `expected the slow move (${slowDurationMs}ms) to take meaningfully longer than the fast move (${fastDurationMs}ms), on the same receiving client`
      );
    } finally {
      await stopRemoteCursorTrail(page);
      pagesWithActiveTrails = pagesWithActiveTrails.filter((p) => p !== page);
    }
  }
);
