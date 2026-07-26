import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

function pageFor(world, which) {
  return which === 'first' ? world.pageA : world.pageB;
}

// SPEC 13.4.0 (re-frozen)/MP4-FIX: samples both sides repeatedly across a
// real burst of sustained play, rather than checking only once - a
// regression back to "permanently frozen while diverged" would show up as
// the remote score never moving across this whole window, which a single
// before/after snapshot could miss if it happened to land after the freeze.
Then(
  "the {word} page's remote match score never permanently freezes while the {word} page's own local score keeps climbing, over several seconds of sustained play",
  { timeout: 15000 },
  async function (remoteWhich, sourceWhich) {
    const remotePage = pageFor(this, remoteWhich);
    const sourcePage = pageFor(this, sourceWhich);

    const samples = [];
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const [sourceScore, remoteScore] = await Promise.all([
        sourcePage.evaluate(() => window.MagicGems.getMatchScore()),
        remotePage.evaluate(() => window.MagicGems.getMatchRemoteScore()),
      ]);
      samples.push({ sourceScore, remoteScore });
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    const first = samples[0];
    const last = samples[samples.length - 1];
    const sourceGain = last.sourceScore - first.sourceScore;
    const remoteGain = last.remoteScore - first.remoteScore;
    assert.ok(
      sourceGain > 0,
      `expected the source score to actually climb during this window (sanity check on autoplay itself) - samples: ${JSON.stringify(samples)}`
    );
    assert.ok(
      remoteGain > 0,
      `expected the remote score to also climb, not stay frozen - samples: ${JSON.stringify(samples)}`
    );
    // Compares GAIN over the window, not the absolute end values - a single
    // lucky big chain can spike the source's own score unevenly between
    // samples, which an absolute-value bound would misread as "falling
    // behind" even during healthy (if bursty) async lag. A genuinely broken
    // reconstruction (SPEC 13.4.0) gains near nothing over the same window
    // regardless of how the source scores, so a generous floor still
    // catches it (observed live: real score climbing steadily while the
    // remote one sat frozen for 26+ seconds straight).
    assert.ok(
      remoteGain >= sourceGain * 0.15,
      `remote score gained too little (${remoteGain}) relative to the source's own gain (${sourceGain}) over the same window - samples: ${JSON.stringify(samples)}`
    );
  }
);
