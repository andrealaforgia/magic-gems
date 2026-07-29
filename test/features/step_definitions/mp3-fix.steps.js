import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { loadMagicGems } from '../../support/load-src.js';

const { hasMatch, applySwap } = loadMagicGems([
  new URL('../../../src/gems.js', import.meta.url),
  new URL('../../../src/board.js', import.meta.url),
  new URL('../../../src/resolution.js', import.meta.url),
]);

function findAdjacentSwap(grid, wantMatch) {
  const size = grid.length;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (col + 1 < size) {
        const a = { row, col };
        const b = { row, col: col + 1 };
        if (hasMatch(applySwap(grid, a, b)) === wantMatch) return { a, b };
      }
      if (row + 1 < size) {
        const a = { row, col };
        const b = { row: row + 1, col };
        if (hasMatch(applySwap(grid, a, b)) === wantMatch) return { a, b };
      }
    }
  }
  throw new Error(`could not find an adjacent swap on the live match board with wantMatch=${wantMatch}`);
}

function directionKey(from, to) {
  if (to.row === from.row + 1) return 'ArrowDown';
  if (to.row === from.row - 1) return 'ArrowUp';
  if (to.col === from.col + 1) return 'ArrowRight';
  if (to.col === from.col - 1) return 'ArrowLeft';
  throw new Error(`cells are not orthogonally adjacent: ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
}

async function moveCursorTo(page, from, to) {
  const verticalKey = to.row > from.row ? 'ArrowDown' : 'ArrowUp';
  for (let i = 0; i < Math.abs(to.row - from.row); i++) await page.keyboard.press(verticalKey);
  const horizontalKey = to.col > from.col ? 'ArrowRight' : 'ArrowLeft';
  for (let i = 0; i < Math.abs(to.col - from.col); i++) await page.keyboard.press(horizontalKey);
}

function pageFor(world, which) {
  return which === 'first' ? world.pageA : world.pageB;
}

Given("I locate an adjacent swap that would produce a match on the second page's local match board", async function () {
  const grid = await this.pageB.evaluate(() => window.MagicGems.getMatchBoard());
  this.matchFoundSwapB = findAdjacentSwap(grid, true);
});

When("I commit that swap on the second page's local match board", async function () {
  const { a, b } = this.matchFoundSwapB;
  const { cursor } = await this.pageB.evaluate(() => window.MagicGems.getMatchInteractionState());

  await moveCursorTo(this.pageB, cursor, a);
  await this.pageB.keyboard.press(' ');
  await this.pageB.keyboard.press(directionKey(a, b));
  await this.pageB.keyboard.press(' ');
});

Then("the second page's local match score has increased", async function () {
  await this.pageB.waitForFunction(() => window.MagicGems.getMatchScore() > 0, null, { timeout: 5000 });
  const score = await this.pageB.evaluate(() => window.MagicGems.getMatchScore());
  assert.ok(score > 0, `expected a positive score, got ${score}`);
});

Then("the first page's own match multiplier bar is shown, in the pixel font", async function () {
  const result = await this.pageA.evaluate(async () => {
    await document.fonts.ready;
    const el = document.getElementById('match-multiplier-message');
    return {
      hidden: document.getElementById('match-multiplier-bar').hidden,
      fontFamily: getComputedStyle(el).fontFamily,
      multiplier: document.getElementById('match-multiplier-fill').dataset.multiplier,
    };
  });
  assert.equal(result.hidden, false, 'expected the multiplier bar to be visible');
  assert.ok(result.fontFamily.includes('Press Start 2P'), `expected the pixel font, got "${result.fontFamily}"`);
  assert.ok(result.multiplier !== undefined && result.multiplier !== '', 'expected a real multiplier reading');
});

Then("the second page's own local match score is still exactly zero", async function () {
  const score = await this.pageB.evaluate(() => window.MagicGems.getMatchScore());
  assert.equal(score, 0);
});

Then('audio is unmuted on both pages', async function () {
  assert.equal(await this.pageA.evaluate(() => window.MagicGems.isMatchAudioMuted()), false);
  assert.equal(await this.pageB.evaluate(() => window.MagicGems.isMatchAudioMuted()), false);
});

When('I press {string} on the {word} page', async function (key, which) {
  await pageFor(this, which).keyboard.press(key);
});

Then('audio is muted on the second page', async function () {
  assert.equal(await this.pageB.evaluate(() => window.MagicGems.isMatchAudioMuted()), true);
});

Then('audio is unmuted on the first page', async function () {
  assert.equal(await this.pageA.evaluate(() => window.MagicGems.isMatchAudioMuted()), false);
});

Then('autoplay is off on both pages', async function () {
  assert.equal(await this.pageA.evaluate(() => window.MagicGems.isMatchAutoplayOn()), false);
  assert.equal(await this.pageB.evaluate(() => window.MagicGems.isMatchAutoplayOn()), false);
});

Then('autoplay is on on the first page', async function () {
  assert.equal(await this.pageA.evaluate(() => window.MagicGems.isMatchAutoplayOn()), true);
});

Then('autoplay is off on the second page', async function () {
  assert.equal(await this.pageB.evaluate(() => window.MagicGems.isMatchAutoplayOn()), false);
});

// AUTOPLAY-PACE2X (SPEC 12.2 re-frozen again) E5: same brisk-but-watchable/
// always-valid properties as single-player's own coverage
// (test/features/autoplay.feature), demonstrated live in a real match
// instead of inferred from shared code.
Then(
  "the {word} page's own match autoplay is clearly brisk but still watchable, and every committed swap actually matches, over several real moves",
  { timeout: 240000 },
  async function (which) {
    const page = pageFor(this, which);
    // A live two-real-page match is far costlier than single-player (a
    // second browser page, a real publish/poll cycle on top) - a smaller
    // target here keeps typical wall-clock cost down while still covering
    // several real moves; the dedicated single-player scenario is the
    // exhaustive, larger-N version of this same check.
    //
    // QA review (commit 036dfdc), Finding 3: derived from the live
    // AUTOPLAY_STEP_MS, matching the same convention every sibling timeout
    // in this feature area already follows, instead of a bare literal.
    const TARGET_KEY_COUNT = 12;
    const stepMs = await page.evaluate(() => window.MagicGems.AUTOPLAY_STEP_MS);
    // QA review (commit c35cbda): TARGET_KEY_COUNT passed explicitly as an
    // argument, not duplicated as a bare 12 inside the predicate -
    // Playwright's in-page callback can't close over the Node-side const,
    // so this is the one way to thread it through as a single source of truth.
    await page.waitForFunction((target) => window.MagicGems.getMatchAutoplayKeyLog().length >= target, TARGET_KEY_COUNT, {
      timeout: stepMs * TARGET_KEY_COUNT * 15,
    });
    const log = await page.evaluate(() => window.MagicGems.getMatchAutoplayKeyLog());
    const gaps = [];
    for (let i = 1; i < log.length; i++) gaps.push(log[i].ts - log[i - 1].ts);
    assert.ok(gaps.every((gap) => gap >= 0), 'expected every gap to be a real, non-negative elapsed time');
    const minGapFloorMs = stepMs * 0.6;
    assert.ok(
      Math.min(...gaps) >= minGapFloorMs,
      `expected even the fastest observed gap to reflect a brisk but still-watchable pace (>= ${minGapFloorMs}ms), got ${JSON.stringify(gaps)}`
    );
    const soundLog = await page.evaluate(() => window.MagicGems.getMatchSoundLog());
    const invalidCount = soundLog.filter((s) => s === 'invalid').length;
    assert.equal(invalidCount, 0, `expected zero invalid-swap sounds, got ${invalidCount} out of ${soundLog.length}`);
  }
);

Then("the second page's match exit overlay is shown", async function () {
  const hidden = await this.pageB.evaluate(() => document.getElementById('match-exit-confirm').hidden);
  assert.equal(hidden, false);
});

Then("the first page's match exit overlay is not shown", async function () {
  const hidden = await this.pageA.evaluate(() => document.getElementById('match-exit-confirm').hidden);
  assert.equal(hidden, true);
});

Then("the second page's match exit overlay is not shown", async function () {
  const hidden = await this.pageB.evaluate(() => document.getElementById('match-exit-confirm').hidden);
  assert.equal(hidden, true);
});

Then('the second page is still in the match', async function () {
  const hidden = await this.pageB.evaluate(() => document.getElementById('match').hidden);
  assert.equal(hidden, false);
});

Then("the second page's match timer reads 10:00 or just under, in the pixel font", async function () {
  const result = await this.pageB.evaluate(async () => {
    await document.fonts.ready;
    const el = document.getElementById('match-timer');
    return { text: el.textContent, fontFamily: getComputedStyle(el).fontFamily };
  });
  assert.ok(/^(10:00|9:5\d)$/.test(result.text), `expected a timer reading close to 10:00, got "${result.text}"`);
  assert.ok(result.fontFamily.includes('Press Start 2P'), `expected the pixel font, got "${result.fontFamily}"`);
});

// QA review (commit 0a86908): mirrors mp3.steps.js's own first-page
// coverage of 13.3.3.1/13.3.3.3/13.3.3.5, on the second page instead.
Then("the second page's match gauge is evenly split at the start", async function () {
  const state = await this.pageB.evaluate(() => {
    const gauge = document.getElementById('match-gauge');
    const gaugeRect = gauge.getBoundingClientRect();
    const midpoint = document.querySelector('.match-gauge-midpoint');
    const midpointRect = midpoint ? midpoint.getBoundingClientRect() : null;
    return {
      localWidth: document.getElementById('match-gauge-local').style.width,
      remoteWidth: document.getElementById('match-gauge-remote').style.width,
      isLocalLeading: gauge.classList.contains('is-local-leading'),
      isRemoteLeading: gauge.classList.contains('is-remote-leading'),
      midpointExists: !!midpoint,
      midpointCenterX: midpointRect ? midpointRect.left + midpointRect.width / 2 : null,
      gaugeCenterX: gaugeRect.left + gaugeRect.width / 2,
    };
  });
  assert.equal(state.localWidth, '50%');
  assert.equal(state.remoteWidth, '50%', 'expected the remote portion to also be 50%, summing to a full bar');
  assert.equal(state.isLocalLeading, false, 'expected no leading class on either side at a 0-0 tie');
  assert.equal(state.isRemoteLeading, false, 'expected no leading class on either side at a 0-0 tie');
  assert.ok(state.midpointExists, 'expected a permanent halfway-mark element');
  assert.ok(
    Math.abs(state.midpointCenterX - state.gaugeCenterX) < 1,
    `expected the halfway mark centred in the gauge, got midpoint=${state.midpointCenterX} gaugeCenter=${state.gaugeCenterX}`
  );
});

// AUTOPLAY-RANDOM-CHOICE (SPEC 12.5) E4/E6: both pages autoplay independently
// from the identical shared starting board (13.3.1) - move CHOICE is drawn
// from each page's own independent cosmeticRandom (13.4.0), but refills
// still draw from the same session-seeded stream (13.3.1). Right after a
// fresh board, the number of valid moves can be small (occasionally just
// one, forced), so an early coincidental identical pick is real and expected
// sometimes - it just keeps both boards in lockstep a little longer, since a
// shared pick against shared refill randomness reproduces the same next
// state exactly. Waiting for a generous number of real logged keys (many
// full moves' worth) makes a persisting coincidence vanishingly unlikely,
// while a genuinely deterministic implementation would never diverge no
// matter how long this waits.
const AUTOPLAY_DIVERGENCE_MIN_KEYS = 60;

Then(
  "both pages' own autoplay move choices diverge from each other, over several real moves",
  { timeout: 90000 },
  async function () {
    const stepMs = await this.pageA.evaluate(() => window.MagicGems.AUTOPLAY_STEP_MS);
    const deadline = Date.now() + stepMs * AUTOPLAY_DIVERGENCE_MIN_KEYS * 2;
    let keyCountA = 0;
    let keyCountB = 0;
    do {
      [keyCountA, keyCountB] = await Promise.all([
        this.pageA.evaluate(() => window.MagicGems.getMatchAutoplayKeyLog().length),
        this.pageB.evaluate(() => window.MagicGems.getMatchAutoplayKeyLog().length),
      ]);
      if (keyCountA >= AUTOPLAY_DIVERGENCE_MIN_KEYS && keyCountB >= AUTOPLAY_DIVERGENCE_MIN_KEYS) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    } while (Date.now() < deadline);

    assert.ok(
      keyCountA >= AUTOPLAY_DIVERGENCE_MIN_KEYS,
      `expected at least ${AUTOPLAY_DIVERGENCE_MIN_KEYS} logged autoplay keys on the first page, got ${keyCountA}`
    );
    assert.ok(
      keyCountB >= AUTOPLAY_DIVERGENCE_MIN_KEYS,
      `expected at least ${AUTOPLAY_DIVERGENCE_MIN_KEYS} logged autoplay keys on the second page, got ${keyCountB}`
    );
    const [boardA, boardB] = await Promise.all([
      this.pageA.evaluate(() => window.MagicGems.getMatchBoard()),
      this.pageB.evaluate(() => window.MagicGems.getMatchBoard()),
    ]);
    assert.notDeepEqual(
      boardA,
      boardB,
      'expected the two independently-autoplaying boards to have diverged by now, but they are still identical'
    );
  }
);

// AUTOPLAY-INVALID-MOVE (E4/E6/E8): mirrors autoplay.steps.js's own
// single-player coverage of both known triggers, against the match driver's
// identical guard - a live match's own two-page overhead keeps the cycle
// count smaller than the single-player version, but this is still many
// cycles, not one.
const AUTOPLAY_INVALID_MOVE_MATCH_CYCLES = 8;

Then(
  "repeatedly selecting a gem by hand before switching autoplay on never produces an invalid swap on the first page's own match, across many cycles",
  { timeout: 120000 },
  async function () {
    const stepMs = await this.pageA.evaluate(() => window.MagicGems.AUTOPLAY_STEP_MS);
    for (let cycle = 0; cycle < AUTOPLAY_INVALID_MOVE_MATCH_CYCLES; cycle++) {
      // Clears a leftover selection from the previous cycle's own toggle-off
      // first, so this cycle's manual select is genuinely fresh - see
      // autoplay.steps.js's own identical comment for why this matters.
      await this.pageA.evaluate(() => {
        if (window.MagicGems.getMatchInteractionState().selection) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        }
      });
      await this.pageA.keyboard.press('ArrowRight');
      await this.pageA.keyboard.press(' ');
      const hasSelection = await this.pageA.evaluate(() => window.MagicGems.getMatchInteractionState().selection !== null);
      assert.ok(hasSelection, `cycle ${cycle}: expected a manual selection to be active before enabling autoplay`);
      await this.pageA.keyboard.press('a'); // autoplay ON, against the dirty state
      await this.pageA.waitForTimeout(stepMs * 10);
      await this.pageA.keyboard.press('a'); // autoplay OFF, ready for the next cycle
    }
    const soundLog = await this.pageA.evaluate(() => window.MagicGems.getMatchSoundLog());
    const invalidCount = soundLog.filter((s) => s === 'invalid').length;
    assert.equal(
      invalidCount,
      0,
      `expected zero invalid-swap sounds across ${AUTOPLAY_INVALID_MOVE_MATCH_CYCLES} cycles, got ${invalidCount} out of ${soundLog.length} total sounds`
    );
  }
);

Then(
  "repeatedly toggling autoplay off mid-plan and back on never produces an invalid swap on the first page's own match, across many cycles",
  { timeout: 120000 },
  async function () {
    const stepMs = await this.pageA.evaluate(() => window.MagicGems.AUTOPLAY_STEP_MS);
    for (let cycle = 0; cycle < AUTOPLAY_INVALID_MOVE_MATCH_CYCLES; cycle++) {
      await this.pageA.keyboard.press('a'); // autoplay ON
      await this.pageA.waitForFunction(() => window.MagicGems.getMatchInteractionState().selection !== null, null, {
        timeout: stepMs * 20,
      });
      await this.pageA.keyboard.press('a'); // autoplay OFF mid-plan - selection survives this
      await this.pageA.keyboard.press('a'); // autoplay back ON, against the dirty state
      await this.pageA.waitForTimeout(stepMs * 10);
      await this.pageA.keyboard.press('a'); // autoplay OFF, ready for the next cycle
    }
    const soundLog = await this.pageA.evaluate(() => window.MagicGems.getMatchSoundLog());
    const invalidCount = soundLog.filter((s) => s === 'invalid').length;
    assert.equal(
      invalidCount,
      0,
      `expected zero invalid-swap sounds across ${AUTOPLAY_INVALID_MOVE_MATCH_CYCLES} cycles, got ${invalidCount} out of ${soundLog.length} total sounds`
    );
  }
);

// MP-SYNC-SEQUENCED root-cause: deliberately widens the real async gap
// between the match view becoming visible and this client's own match
// accessors being registered (both depend on the same gem-sprite load
// finishing), so the race reproduces every run rather than only under
// incidental system load.
const SLOW_SPRITE_DELAY_MS = 1500;

Given("the {word} page's own gem sprites load slowly", async function (which) {
  const page = pageFor(this, which);
  await page.route('**/assets/gems/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, SLOW_SPRITE_DELAY_MS));
    await route.fallback();
  });
});

// This assertion only holds because "the match begins on both pages" (used
// above) waits for genuine readiness, not merely DOM visibility - it's a
// fast-failing regression guard for that fix, not a redundant restatement of
// it: if that wait ever reverts to visibility alone, this scenario's own
// artificially-widened race window makes this line the one that catches it.
Then("the {word} page's own match score can be read without error", async function (which) {
  const score = await pageFor(this, which).evaluate(() => window.MagicGems.getMatchScore());
  assert.equal(typeof score, 'number', `expected a real numeric score, got ${JSON.stringify(score)}`);
});
