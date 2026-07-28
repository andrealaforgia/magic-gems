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

// MP-GRID-ALIGN/SPEC 13.3.2: the remote column previously lacked the local
// column's own multiplier bar, so its canvas started one bar-height higher -
// checked both at match start and again after real play (a swap/cascade on
// the local side), since either grid resizing or a layout-affecting DOM
// change during play could reintroduce the drift.
Then("the first page's local and remote grids are the same size, with their top edges aligned", async function () {
  const layout = await this.pageA.evaluate(() => ({
    local: document.getElementById('match-local-board').getBoundingClientRect(),
    remote: document.getElementById('match-remote-board').getBoundingClientRect(),
  }));
  assert.equal(layout.local.width, layout.remote.width, `expected equal widths, got local=${layout.local.width} remote=${layout.remote.width}`);
  assert.equal(layout.local.height, layout.remote.height, `expected equal heights, got local=${layout.local.height} remote=${layout.remote.height}`);
  assert.ok(
    Math.abs(layout.local.top - layout.remote.top) < 1,
    `expected aligned top edges, got local.top=${layout.local.top} remote.top=${layout.remote.top}`
  );
});

// MP-WINDOW-MARGIN/SPEC 13.3.8: the grids must not run flush against the
// window edges - a real, plainly visible, equal gap on both sides. "Plainly
// visible" is operationalised as a minimum pixel floor (comfortably above
// rounding/measurement noise), not merely "greater than zero".
const WINDOW_MARGIN_MIN_VISIBLE_PX = 8;
const WINDOW_MARGIN_EQUAL_TOLERANCE_PX = 2;

Then("the first page's match leaves a plainly visible, equal margin at both window edges", async function () {
  const { leftMargin, rightMargin } = await this.pageA.evaluate(() => {
    const local = document.getElementById('match-local-board').getBoundingClientRect();
    const remote = document.getElementById('match-remote-board').getBoundingClientRect();
    return { leftMargin: local.left, rightMargin: window.innerWidth - remote.right };
  });
  assert.ok(
    leftMargin >= WINDOW_MARGIN_MIN_VISIBLE_PX,
    `expected a plainly visible left margin (>= ${WINDOW_MARGIN_MIN_VISIBLE_PX}px), got ${leftMargin}px`
  );
  assert.ok(
    rightMargin >= WINDOW_MARGIN_MIN_VISIBLE_PX,
    `expected a plainly visible right margin (>= ${WINDOW_MARGIN_MIN_VISIBLE_PX}px), got ${rightMargin}px`
  );
  assert.ok(
    Math.abs(leftMargin - rightMargin) <= WINDOW_MARGIN_EQUAL_TOLERANCE_PX,
    `expected equal left/right margins, got left=${leftMargin}px right=${rightMargin}px`
  );
});

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
