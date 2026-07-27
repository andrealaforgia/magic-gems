import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { FAILING_NETWORK_DELAY_MS } from './mp4.steps.js';

function pageFor(world, which) {
  return which === 'first' ? world.pageA : world.pageB;
}

// SPEC 13.5.3/MP-RESULT-WATERMARK: the result is a watermark LAID OVER the
// still-visible frozen grid, not a separate opaque screen that replaces it -
// so both the match view itself and the two score displays (already part of
// that same still-visible view) must remain unhidden, not merely the
// watermark's own text/color/size.
Then(
  "the {word} page's match result is a large, white, translucent watermark in the display font, over the still-visible frozen match view, with both players' final scores shown",
  async function (which) {
    const page = pageFor(this, which);
    const result = await page.evaluate(async () => {
      await document.fonts.ready;
      const matchHidden = document.getElementById('match').hidden;
      const messageEl = document.getElementById('match-result-message');
      const style = getComputedStyle(messageEl);
      const localScoreEl = document.getElementById('match-local-score');
      const remoteScoreEl = document.getElementById('match-remote-score');
      return {
        matchHidden,
        color: style.color,
        fontFamily: style.fontFamily,
        fontSizePx: parseFloat(style.fontSize),
        scoreFontSizePx: parseFloat(getComputedStyle(localScoreEl).fontSize),
        pixelFontLoaded: [...document.fonts].some((f) => f.family === 'Press Start 2P' && f.status === 'loaded'),
        localScoreHidden: localScoreEl.hidden,
        remoteScoreHidden: remoteScoreEl.hidden,
        localScoreText: localScoreEl.textContent,
        remoteScoreText: remoteScoreEl.textContent,
      };
    });

    assert.equal(result.matchHidden, false, 'expected the match view (frozen boards) to still be visible, not replaced');
    assert.ok(result.fontFamily.includes('Press Start 2P'), `expected the display font, got "${result.fontFamily}"`);
    assert.ok(result.pixelFontLoaded, 'expected the "Press Start 2P" font to have actually loaded');

    // rgb(...)/rgba(...) with an alpha channel strictly below 1 - a fully
    // opaque colour would defeat the "watermark over the frozen grid" point
    // entirely (SPEC 13.5.3 explicitly contrasts this against an opaque
    // screen that replaces the boards).
    const rgba = result.color.match(/rgba?\(([^)]+)\)/);
    assert.ok(rgba, `expected an rgb/rgba color, got "${result.color}"`);
    const channels = rgba[1].split(',').map((s) => parseFloat(s));
    const [r, g, b, a = 1] = channels;
    assert.ok(r >= 200 && g >= 200 && b >= 200, `expected a white-ish colour, got rgb(${r}, ${g}, ${b})`);
    assert.ok(a < 1, `expected a translucent (alpha < 1) colour, got alpha ${a}`);

    assert.ok(
      result.fontSizePx >= result.scoreFontSizePx * 2,
      `expected the outcome text to be LARGE relative to the score text, got ${result.fontSizePx}px vs ${result.scoreFontSizePx}px`
    );

    assert.equal(result.localScoreHidden, false, "expected this player's own final score to still be shown");
    assert.equal(result.remoteScoreHidden, false, "expected the opponent's final score to still be shown");
    assert.match(result.localScoreText, /^Score: \d+$/, `expected a real final score, got "${result.localScoreText}"`);
    assert.match(result.remoteScoreText, /^Score: \d+$/, `expected a real final score, got "${result.remoteScoreText}"`);
  }
);

Then(
  "the {word} page's match result eventually shows {string}",
  { timeout: 8000 },
  async function (which, expectedMessage) {
    const page = pageFor(this, which);
    await page.waitForFunction(() => document.getElementById('match-result').hidden === false, null, { timeout: 6000 });
    const message = await page.textContent('#match-result-message');
    assert.equal(message, expectedMessage);
  }
);

// QA review (commit e6e6715)/SPEC 13.4.2 pattern reused against surrender:
// deliberately much shorter than FAILING_NETWORK_DELAY_MS - if ending this
// client's own match were ever gated on the surrender request's own
// network response, this would time out instead of passing quickly.
Then(
  "the {word} page's match result eventually shows {string} within a normal, short amount of time",
  async function (which, expectedMessage) {
    const page = pageFor(this, which);
    await page.waitForFunction(() => document.getElementById('match-result').hidden === false, null, {
      timeout: FAILING_NETWORK_DELAY_MS - 1000,
    });
    const message = await page.textContent('#match-result-message');
    assert.equal(message, expectedMessage);
  }
);

// SPEC 13.5.2/MP5: each client ends its own match independently once ITS OWN
// countdown reaches 0:00 - fast-forwarding both pages' own clocks is the
// real-equivalent of letting a full 10-minute match run out on both, without
// an acceptance test actually waiting 10 real minutes.
When("both pages' match clocks are fast-forwarded to just past 0:00", async function () {
  await this.pageA.clock.install();
  await this.pageB.clock.install();
  await this.pageA.clock.fastForward('10:01');
  await this.pageB.clock.fastForward('10:01');
});

Then('no match result screen is ever shown', async function () {
  const hidden = await this.page.evaluate(() => document.getElementById('match-result').hidden);
  assert.equal(hidden, true);
});
