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
  { timeout: 10000 },
  async function (remoteWhich, sourceWhich) {
    const remotePage = pageFor(this, remoteWhich);
    const sourcePage = pageFor(this, sourceWhich);

    // Polls both pages' CURRENT state each round, rather than freezing a
    // single snapshot up front - a chain reaction can still be raising the
    // source page's own score for a moment after "has increased" first
    // becomes true, so a fixed target could race a still-climbing source.
    const deadline = Date.now() + 8000;
    let sourceScore, sourceBoard, remoteScore;
    do {
      [sourceScore, sourceBoard, remoteScore] = await Promise.all([
        sourcePage.evaluate(() => window.MagicGems.getMatchScore()),
        sourcePage.evaluate(() => window.MagicGems.getMatchBoard()),
        remotePage.evaluate(() => window.MagicGems.getMatchRemoteScore()),
      ]);
      if (sourceScore > 0 && sourceScore === remoteScore) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    } while (Date.now() < deadline);

    assert.ok(sourceScore > 0, `expected a positive source score, got ${sourceScore}`);
    assert.equal(remoteScore, sourceScore, "expected the remote score to eventually catch up to the source page's own");
    const remoteBoard = await remotePage.evaluate(() => window.MagicGems.getMatchRemoteBoard());
    assert.deepEqual(remoteBoard, sourceBoard);
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
