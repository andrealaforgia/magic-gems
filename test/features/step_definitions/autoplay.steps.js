import { Given, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { classifiedGrid } from '../support/board-reader.js';

Given('I record the cursor position', async function () {
  // Autoplay can be toggled off mid-move (after SPACE selects but before the
  // aim+commit that follows) - a lingering selection would mean no cursor ring
  // is drawn at all (findHighlight('cursor') finds nothing while a selection is
  // active), and the very next arrow key would designate a target instead of
  // moving the cursor. Clear any such leftover selection first so the recorded
  // position reflects a genuinely plain, ready-for-normal-input cursor state.
  await this.page.evaluate(() => {
    if (window.MagicGems.getInteractionState().selection) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    }
  });
  const state = await this.page.evaluate(() => window.MagicGems.getInteractionState());
  this.recordedCursor = state.cursor;
});

Then('the cursor has moved exactly one step right of the position recorded before', async function () {
  const state = await this.page.evaluate(() => window.MagicGems.getInteractionState());
  // Autoplay can leave the cursor anywhere, including the board's rightmost
  // column, where ArrowRight is legitimately blocked (no move, not a bug) -
  // clamp the expectation to the board's own last column rather than assuming
  // the recorded position always has room to move.
  const expectedCol = Math.min(this.recordedCursor.col + 1, 7);
  assert.deepEqual(state.cursor, { row: this.recordedCursor.row, col: expectedCol });
});

Then('autoplay is off', async function () {
  const on = await this.page.evaluate(() => window.MagicGems.isAutoplayOn());
  assert.equal(on, false);
});

Then('autoplay is on', async function () {
  const on = await this.page.evaluate(() => window.MagicGems.isAutoplayOn());
  assert.equal(on, true);
});

Then('the autoplay instruction line reads {string} in the pixel font, below the grid', async function (expectedText) {
  const result = await this.page.evaluate(async () => {
    await document.fonts.ready;
    const hintEl = document.getElementById('autoplay-hint');
    const canvasRect = document.getElementById('board').getBoundingClientRect();
    const hintRect = hintEl.getBoundingClientRect();
    return {
      text: hintEl.textContent,
      fontFamily: getComputedStyle(hintEl).fontFamily,
      pixelFontLoaded: [...document.fonts].some((f) => f.family === 'Press Start 2P' && f.status === 'loaded'),
      isBelowGrid: hintRect.top >= canvasRect.bottom,
    };
  });
  assert.equal(result.text, expectedText);
  assert.ok(result.fontFamily.includes('Press Start 2P'), `expected the pixel font, got "${result.fontFamily}"`);
  assert.ok(result.pixelFontLoaded, 'expected the "Press Start 2P" font to have actually loaded');
  assert.ok(result.isBelowGrid, 'expected the autoplay instruction line to sit below the grid');
});

// Autoplay (unlike a one-off manual commit) never stops on its own - by the
// time a `!isAnimating()` wait resolves, its own next move may already be
// under way again at AUTOPLAY-SPEED's much faster cadence, so a single
// wait-then-sample pair can still catch a mid-cascade frame. Retries the whole
// wait+sample within one generous overall deadline rather than trusting any
// single sample.
async function waitForRealCondition(page, checkFn, overallTimeoutMs) {
  const deadline = Date.now() + overallTimeoutMs;
  let lastResult = false;
  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await page.waitForFunction(() => !window.MagicGems.isAnimating(), null, { timeout: remaining });
    lastResult = await checkFn();
    if (lastResult) return;
  }
  assert.ok(lastResult, 'expected condition to hold on some settled sample within the overall timeout');
}

// The overallTimeoutMs budgets below are *derived* from AUTOPLAY-SPEED's own
// live cadence constant (src/main.js's AUTOPLAY_STEP_MS, exported for exactly
// this purpose) rather than a re-typed literal - a future retune of that
// constant widens or narrows this budget automatically instead of silently
// invalidating a comment-only cross-link (QA test-design review, follow-up on
// commit aa04ada). STEPS_OF_HEADROOM=140 keeps the same ~15s real budget the
// suite has run with at the current 107ms cadence (140 x 107 = 14980ms).
const STEPS_OF_HEADROOM = 140;

async function autoplayRealTimeoutMs(page) {
  const stepMs = await page.evaluate(() => window.MagicGems.AUTOPLAY_STEP_MS);
  assert.ok(Number.isFinite(stepMs) && stepMs > 0, `expected a real AUTOPLAY_STEP_MS exported from the live page, got ${stepMs}`);
  return stepMs * STEPS_OF_HEADROOM;
}

Then('the board settles into a new, match-free arrangement within a generous real timeout', async function () {
  const overallTimeoutMs = await autoplayRealTimeoutMs(this.page);
  // isAnimating() alone is trivially true-before-anything-starts right after
  // toggling autoplay on (its own first move hasn't been scheduled yet) - wait
  // for real evidence a completion actually happened first (the score leaving
  // its starting value, true for every fresh-load scenario using this step).
  await this.page.waitForFunction(
    () => document.getElementById('score').textContent !== 'Score: 0',
    null,
    { timeout: overallTimeoutMs }
  );
  await waitForRealCondition(
    this.page,
    async () => {
      const grid = await classifiedGrid(this.page);
      return (await this.page.evaluate((g) => window.MagicGems.hasMatch(g), grid)) === false;
    },
    overallTimeoutMs
  );
});

Then('the classified gem grid has changed from the one recorded before, within a generous real timeout', async function () {
  await waitForRealCondition(
    this.page,
    async () => {
      const grid = await classifiedGrid(this.page);
      return JSON.stringify(grid) !== JSON.stringify(this.recordedGemGrid);
    },
    await autoplayRealTimeoutMs(this.page)
  );
});

// SPEC 12.2 (re-frozen, AUTOPLAY-SPEED): checked against the previously-delivered
// watchable pace (450ms between key presses). Some gaps legitimately include a
// cascade/fall/revive animation settling between moves (longer, and variable
// with chain depth) - the smallest observed gap is the robust signal instead,
// reflecting two steps within the very same move with no animation wait between
// them, i.e. autoplay's own base cadence directly.
Then('autoplay\'s own key presses follow one another rapidly, clearly faster than manual play\'s own pace', async function () {
  const log = await this.page.evaluate(() => window.MagicGems.getAutoplayKeyLog());
  assert.ok(log.length >= 2, `expected at least two logged autoplay key presses, got ${log.length}`);
  const gaps = [];
  for (let i = 1; i < log.length; i++) gaps.push(log[i].ts - log[i - 1].ts);
  assert.ok(gaps.every((gap) => gap >= 0), 'expected every gap to be a real, non-negative elapsed time');
  assert.ok(
    Math.min(...gaps) < 200,
    `expected the fastest observed gap to reflect a brisk cadence well under the previous 450ms pace, got ${JSON.stringify(gaps)}`
  );
});

Then('injecting an arrow key, SPACE, and Escape right now has no effect on the cursor or selection', async function () {
  // Done as one synchronous in-page pass (not separate Playwright round-trips) so
  // this reliably runs well inside the gap before autoplay's own first scheduled
  // move - autoplay is real and running, so any inter-step delay here would race it.
  const result = await this.page.evaluate(() => {
    const before = JSON.stringify(window.MagicGems.getInteractionState());
    for (const key of ['ArrowRight', ' ', 'Escape']) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key }));
    }
    const after = JSON.stringify(window.MagicGems.getInteractionState());
    return { before, after };
  });
  assert.equal(result.after, result.before, 'expected injected input to have no effect on cursor/selection while autoplay is on');
});

Then('the score strictly increases across at least 3 separate real completions within a generous timeout', async function () {
  await this.page.evaluate(() => {
    window.__scoreIncreaseCount = 0;
    window.__lastSeenScore = 0;
  });
  await this.page.waitForFunction(
    () => {
      const current = Number(document.getElementById('score').textContent.replace('Score: ', ''));
      if (current > window.__lastSeenScore) {
        window.__scoreIncreaseCount++;
        window.__lastSeenScore = current;
      }
      return window.__scoreIncreaseCount >= 3;
    },
    null,
    { timeout: await autoplayRealTimeoutMs(this.page) }
  );
});

// Owner report/AUTOPLAY-FIX (SPEC 12.2/6.5): the score-rising check above
// only proves SOME completions happened, which could mask an occasional
// invalid swap interspersed among valid ones - the Owner's own framing
// ("a short window can look correct... do not rely on aggregate score
// rising"). Runs autoplay for real, on a live client, until many
// completions have actually happened, then checks the sound log (which
// records an 'invalid' cue for every swap that fails to match, distinct
// from the reverted-swap no-op) never contains one across that whole run -
// not a sample, the complete real log.
Then(
  'every autoplay-committed swap actually matches - no invalid swap sound plays, across an extended real run',
  { timeout: 60000 },
  async function () {
    const timeout = (await autoplayRealTimeoutMs(this.page)) * 3;
    await this.page.evaluate(() => {
      window.__completionCount = 0;
      window.__lastSeenScoreForInvalidCheck = 0;
    });
    await this.page.waitForFunction(
      () => {
        const current = Number(document.getElementById('score').textContent.replace('Score: ', ''));
        if (current > window.__lastSeenScoreForInvalidCheck) {
          window.__completionCount++;
          window.__lastSeenScoreForInvalidCheck = current;
        }
        return window.__completionCount >= 15;
      },
      null,
      { timeout }
    );
    const soundLog = await this.page.evaluate(() => window.MagicGems.getSoundLog());
    const invalidCount = soundLog.filter((s) => s === 'invalid').length;
    assert.equal(
      invalidCount,
      0,
      `expected zero invalid-swap sounds across this run, got ${invalidCount} out of ${soundLog.length} total sounds`
    );
  }
);

Then('the score reads greater than 0', async function () {
  const score = await this.page.evaluate(() => Number(document.getElementById('score').textContent.replace('Score: ', '')));
  assert.ok(score > 0, `expected the score to have increased, was ${score}`);
});

Then('the autoplay indicator is hidden', async function () {
  const visibility = await this.page.evaluate(
    () => getComputedStyle(document.getElementById('autoplay-indicator')).visibility
  );
  assert.equal(visibility, 'hidden');
});

Then('the autoplay indicator reads {string} above the score, blinking, in the pixel font', async function (expectedText) {
  const result = await this.page.evaluate(() => {
    const indicatorEl = document.getElementById('autoplay-indicator');
    const scoreRect = document.getElementById('score').getBoundingClientRect();
    const indicatorRect = indicatorEl.getBoundingClientRect();
    const style = getComputedStyle(indicatorEl);
    return {
      text: indicatorEl.textContent,
      fontFamily: style.fontFamily,
      visibility: style.visibility,
      animationName: style.animationName,
      isAboveScore: indicatorRect.bottom <= scoreRect.top,
    };
  });
  assert.equal(result.text, expectedText);
  assert.ok(result.fontFamily.includes('Press Start 2P'), `expected the pixel font, got "${result.fontFamily}"`);
  assert.equal(result.visibility, 'visible');
  assert.notEqual(result.animationName, 'none', 'expected a CSS blink animation to be applied');
  assert.ok(result.isAboveScore, 'expected the indicator to sit above the score');
});
