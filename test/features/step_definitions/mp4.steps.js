import { Given, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

function pageFor(world, which) {
  return which === 'first' ? world.pageA : world.pageB;
}

// SPEC 13.4.2/E4: simulates a genuinely FAILING sync channel for one client -
// every one of its own session requests hangs for a while, then fails
// outright. Used to prove the strongest form of E4: even permanent sync
// failure on this client must never block or delay its own local play.
const FAILING_NETWORK_DELAY_MS = 3000;
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

    // Polls both pages' CURRENT state each round, rather than freezing a
    // single snapshot up front - a chain reaction can still be raising the
    // source page's own score for a moment after "has increased" first
    // becomes true, so a fixed target could race a still-climbing source.
    // Generous margin: this same step also covers the scenario where one
    // page's own channel is deliberately slowed (an extra ~1.2s per
    // request, on both its publishes and its polls).
    const deadline = Date.now() + 20000;
    let sourceScore, remoteScore;
    do {
      [sourceScore, remoteScore] = await Promise.all([
        sourcePage.evaluate(() => window.MagicGems.getMatchScore()),
        remotePage.evaluate(() => window.MagicGems.getMatchRemoteScore()),
      ]);
      if (sourceScore > 0 && remoteScore > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    } while (Date.now() < deadline);

    // MP4-MOVES: the remote side replays the opponent's moves through the
    // same real per-phase animation timing as normal play - a positive
    // score only confirms the FIRST completion in a chain landed, not that
    // every subsequent chained step (each its own animation phase) has too.
    // Comfortably longer than the longest single phase's own duration.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const finalSourceScore = await sourcePage.evaluate(() => window.MagicGems.getMatchScore());
    const finalSourceBoard = await sourcePage.evaluate(() => window.MagicGems.getMatchBoard());
    const finalRemoteScore = await remotePage.evaluate(() => window.MagicGems.getMatchRemoteScore());
    const finalRemoteBoard = await remotePage.evaluate(() => window.MagicGems.getMatchRemoteBoard());

    assert.ok(finalSourceScore > 0, `expected a positive source score, got ${finalSourceScore}`);
    assert.ok(finalRemoteScore > 0, `expected the remote score to eventually become positive too, got ${finalRemoteScore}`);
    assert.deepEqual(finalRemoteBoard, finalSourceBoard);
  }
);

Then(
  "the {word} page's own match gauge eventually shows the {word} page's own player leading",
  { timeout: 10000 },
  async function (gaugeWhich, leaderWhich) {
    const gaugePage = pageFor(this, gaugeWhich);
    const leaderIsLocalOnGaugePage = gaugeWhich === leaderWhich;

    await gaugePage.waitForFunction(
      (expectAboveHalf) => {
        const width = parseFloat(document.getElementById('match-gauge-fill').style.width);
        return expectAboveHalf ? width > 50 : width < 50;
      },
      leaderIsLocalOnGaugePage,
      { timeout: 8000 }
    );
  }
);
