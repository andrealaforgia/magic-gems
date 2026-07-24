import { Given, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

// The real target is 80% of viewport height, but computeCellSize() floors to a whole
// pixel and quantizes to a multiple of 8 cells, so the rendered ratio is always
// slightly under 0.8. This window comfortably covers that quantization loss without
// accepting a materially different board size.
const HEIGHT_RATIO_TOLERANCE = 0.05;
const TARGET_HEIGHT_RATIO = 0.8;

Given('the viewport is {int} by {int}', async function (width, height) {
  await this.page.setViewportSize({ width, height });
});

Then("the board's height is about 80% of the viewport height", async function () {
  const canvasHeight = await this.page.evaluate(() => document.getElementById('board').height);
  const viewport = this.page.viewportSize();
  const ratio = canvasHeight / viewport.height;
  assert.ok(
    Math.abs(ratio - TARGET_HEIGHT_RATIO) <= HEIGHT_RATIO_TOLERANCE,
    `board height ratio was ${ratio.toFixed(3)}, expected close to ${TARGET_HEIGHT_RATIO}`
  );
});

Then('the board does not overflow the viewport horizontally', async function () {
  const rect = await this.page.evaluate(() =>
    document.getElementById('board').getBoundingClientRect()
  );
  const viewport = this.page.viewportSize();
  assert.ok(rect.left >= 0, `canvas starts left of the viewport (left=${rect.left})`);
  assert.ok(
    rect.right <= viewport.width,
    `canvas overflows the viewport horizontally (right=${rect.right}, viewport width=${viewport.width})`
  );
});
