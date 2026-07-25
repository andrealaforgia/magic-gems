import { Given, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { VIEWPORT_CENTER_TOLERANCE_RATIO } from '../support/pixel-utils.js';

Given("the first page's viewport is {int} by {int}", async function (width, height) {
  await this.pageA.setViewportSize({ width, height });
});

Then("the first page's match does not overflow the viewport horizontally", async function () {
  const overflow = await this.pageA.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(
    overflow.scrollWidth <= overflow.clientWidth,
    `expected no horizontal overflow, got scrollWidth=${overflow.scrollWidth} > clientWidth=${overflow.clientWidth}`
  );
});

Then(
  "the first page's local grid is on the left, the remote grid is on the right, and the centre shows the countdown and gauge",
  async function () {
    const layout = await this.pageA.evaluate(() => ({
      local: document.getElementById('match-local-board').getBoundingClientRect(),
      remote: document.getElementById('match-remote-board').getBoundingClientRect(),
      timer: document.getElementById('match-timer').getBoundingClientRect(),
      gauge: document.getElementById('match-gauge').getBoundingClientRect(),
    }));
    assert.ok(layout.local.width > 0 && layout.local.height > 0, 'expected the local grid to be visible');
    assert.ok(layout.remote.width > 0 && layout.remote.height > 0, 'expected the remote grid to be visible');
    // SPEC 13.3.7: fully visible, not merely non-zero-sized - a grid can have
    // positive width while still being clipped off the left edge of the
    // viewport (negative x), which this same-width check alone would miss.
    assert.ok(layout.local.left >= 0, `expected the local grid to start within the viewport, got left=${layout.local.left}`);
    assert.ok(layout.local.right <= layout.remote.left, 'expected the local grid to be positioned left of the remote grid');
    assert.ok(layout.timer.width > 0 && layout.timer.height > 0, 'expected the countdown timer to be visible');
    assert.ok(layout.gauge.width > 0 && layout.gauge.height > 0, 'expected the gauge to be visible');
  }
);

Then("the first page's gauge is vertically centred on the screen", async function () {
  const { gaugeCenterY, viewportHeight } = await this.pageA.evaluate(() => {
    const rect = document.getElementById('match-gauge').getBoundingClientRect();
    return { gaugeCenterY: rect.top + rect.height / 2, viewportHeight: window.innerHeight };
  });
  const dy = Math.abs(gaugeCenterY - viewportHeight / 2);
  assert.ok(
    dy < viewportHeight * VIEWPORT_CENTER_TOLERANCE_RATIO,
    `expected the gauge centred vertically, off by ${dy}px (viewport height ${viewportHeight})`
  );
});
