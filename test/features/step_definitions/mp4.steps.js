import { Given, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

function pageFor(world, which) {
  return which === 'first' ? world.pageA : world.pageB;
}

// SPEC 13.4.2/E4: simulates a genuinely FAILING sync channel for one client -
// every one of its own session requests hangs for a while, then fails
// outright. Used to prove the strongest form of E4: even permanent sync
// failure on this client must never block or delay its own local play.
// Exported so other step files (e.g. mp5.steps.js) can reuse it for the same
// fault shape against a different action.
export const FAILING_NETWORK_DELAY_MS = 3000;
// A merely SLOW (not failing) channel for the combined scenario - degraded,
// but sync still eventually gets through, since that scenario also proves
// the opponent still sees this client's moves despite the degradation.
const SLOW_NETWORK_DELAY_MS = 1200;

Given("the {word} page's session network requests are now slow and failing", async function (which) {
  const page = pageFor(this, which);
  await page.route('**/api/magic-gems/session**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, FAILING_NETWORK_DELAY_MS));
    await route.abort('failed');
  });
});

Given("the {word} page's session network requests are now slow", async function (which) {
  const page = pageFor(this, which);
  await page.route('**/api/magic-gems/session**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, SLOW_NETWORK_DELAY_MS));
    // Falls back to the context-level mock installed in hooks.js (still the
    // one actually answering the request) - route.continue() here would
    // instead send it on to the real network, past that mock entirely.
    await route.fallback();
  });
});

Then(
  "the {word} page's local match score has increased within a normal, short amount of time",
  async function (which) {
    const page = pageFor(this, which);
    // Deliberately much shorter than FAILING_NETWORK_DELAY_MS/SLOW_NETWORK_DELAY_MS
    // above - if local scoring were ever gated on that degraded network call,
    // this would time out instead of passing quickly.
    await page.waitForFunction(() => window.MagicGems.getMatchScore() > 0, null, { timeout: 2000 });
    const score = await page.evaluate(() => window.MagicGems.getMatchScore());
    assert.ok(score > 0, `expected a positive score within 2000ms, got ${score}`);
  }
);

Then(
  "the {word} page's remote match board and score eventually reflect the {word} page's own local board and score",
  { timeout: 25000 },
  async function (remoteWhich, sourceWhich) {
    const remotePage = pageFor(this, remoteWhich);
    const sourcePage = pageFor(this, sourceWhich);

    // MP-SYNC-SNAPSHOT/SPEC 13.4: polls both pages' CURRENT state each round
    // until they actually match, rather than a fixed settle-then-sleep - a
    // snapshot only updates the remote grid once it has actually arrived
    // over the network (13.4.2's own async, best-effort delivery), which can
    // briefly lag behind a degraded channel or a sustained burst of moves
    // (mp4-fix.feature).
    const deadline = Date.now() + 20000;
    let finalSourceScore, finalRemoteScore, finalSourceBoard, finalRemoteBoard;
    do {
      [finalSourceScore, finalRemoteScore, finalSourceBoard, finalRemoteBoard] = await Promise.all([
        sourcePage.evaluate(() => window.MagicGems.getMatchScore()),
        remotePage.evaluate(() => window.MagicGems.getMatchRemoteScore()),
        sourcePage.evaluate(() => window.MagicGems.getMatchBoard()),
        remotePage.evaluate(() => window.MagicGems.getMatchRemoteBoard()),
      ]);
      const boardsMatch = JSON.stringify(finalSourceBoard) === JSON.stringify(finalRemoteBoard);
      const scoresMatch = finalSourceScore > 0 && finalRemoteScore === finalSourceScore;
      if (boardsMatch && scoresMatch) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    } while (Date.now() < deadline);

    assert.ok(finalSourceScore > 0, `expected a positive source score, got ${finalSourceScore}`);
    // MP-SYNC-SNAPSHOT/SPEC 13.4.0: the remote score is the opponent's own
    // exact reported value, drawn directly rather than independently
    // derived - so once a snapshot has arrived, it must match exactly.
    assert.equal(
      finalRemoteScore,
      finalSourceScore,
      `expected the remote score (${finalRemoteScore}) to exactly match the source score (${finalSourceScore})`
    );
    assert.deepEqual(finalRemoteBoard, finalSourceBoard);
  }
);

// MP-SYNC-SNAPSHOT/SPEC 13.4/E7: a remote update is a direct board draw -
// no sound plays for it, unlike the earlier move-replay approach's own
// (silent, but animated) replay. Records this page's own sound log length
// per its own World instance, keyed by which page, so both pages' own
// recordings can coexist within the same scenario.
Given("I record the {word} page's own match sound log", async function (which) {
  this.recordedSoundLogLengths = this.recordedSoundLogLengths || {};
  this.recordedSoundLogLengths[which] = await pageFor(this, which).evaluate(() => window.MagicGems.getMatchSoundLog().length);
});

Then("the {word} page's own match sound log is unchanged from what was recorded before", async function (which) {
  const recordedLength = this.recordedSoundLogLengths[which];
  const currentLog = await pageFor(this, which).evaluate(() => window.MagicGems.getMatchSoundLog());
  assert.equal(
    currentLog.length,
    recordedLength,
    `expected no new sounds on the ${which} page, got ${JSON.stringify(currentLog.slice(recordedLength))}`
  );
});

Then(
  "the {word} page's own match gauge eventually shows the {word} page's own player leading",
  { timeout: 10000 },
  async function (gaugeWhich, leaderWhich) {
    const gaugePage = pageFor(this, gaugeWhich);
    const leaderIsLocalOnGaugePage = gaugeWhich === leaderWhich;

    await gaugePage.waitForFunction(
      (expectAboveHalf) => {
        const width = parseFloat(document.getElementById('match-gauge-local').style.width);
        return expectAboveHalf ? width > 50 : width < 50;
      },
      leaderIsLocalOnGaugePage,
      { timeout: 8000 }
    );

    // QA review (commit 0a86908): the width threshold above only proves the
    // boundary moved - this proves 13.3.3.1 (the two portions still sum to a
    // full bar), 13.3.3.3 (the halfway mark stays centred once the boundary
    // has actually moved off it), and 13.3.3.4 (the leading indicator and
    // colour actually swapped to the correct side, not just the width).
    const state = await gaugePage.evaluate(() => {
      const gauge = document.getElementById('match-gauge');
      const gaugeRect = gauge.getBoundingClientRect();
      const midpoint = document.querySelector('.match-gauge-midpoint');
      const midpointRect = midpoint.getBoundingClientRect();
      return {
        localWidth: document.getElementById('match-gauge-local').style.width,
        remoteWidth: document.getElementById('match-gauge-remote').style.width,
        isLocalLeading: gauge.classList.contains('is-local-leading'),
        isRemoteLeading: gauge.classList.contains('is-remote-leading'),
        localColor: getComputedStyle(document.getElementById('match-gauge-local')).backgroundColor,
        remoteColor: getComputedStyle(document.getElementById('match-gauge-remote')).backgroundColor,
        midpointCenterX: midpointRect.left + midpointRect.width / 2,
        gaugeCenterX: gaugeRect.left + gaugeRect.width / 2,
      };
    });
    assert.equal(
      parseFloat(state.localWidth) + parseFloat(state.remoteWidth),
      100,
      `expected local+remote widths to sum to a full bar, got ${state.localWidth} + ${state.remoteWidth}`
    );
    assert.equal(state.isLocalLeading, leaderIsLocalOnGaugePage, 'expected the leading class on the correct side');
    assert.equal(state.isRemoteLeading, !leaderIsLocalOnGaugePage, 'expected the leading class not on the trailing side');
    const leaderColor = leaderIsLocalOnGaugePage ? state.localColor : state.remoteColor;
    const trailerColor = leaderIsLocalOnGaugePage ? state.remoteColor : state.localColor;
    assert.equal(leaderColor, 'rgb(0, 229, 168)', `expected the leader's portion in the leader-green colour, got ${leaderColor}`);
    assert.equal(trailerColor, 'rgb(255, 107, 107)', `expected the trailer's portion in the trailer-red colour, got ${trailerColor}`);
    assert.ok(
      Math.abs(state.midpointCenterX - state.gaugeCenterX) < 1,
      `expected the halfway mark to remain centred after the boundary moved, got midpoint=${state.midpointCenterX} gaugeCenter=${state.gaugeCenterX}`
    );
  }
);
