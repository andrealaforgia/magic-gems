import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { SHAPE_FILL_ALPHA_THRESHOLD } from '../support/pixel-utils.js';

const CENTERING_TOLERANCE_PX = 3;

// Scans outward from the probe canvas's true centre along a cardinal direction and
// returns the pixel distance to where the shape's solid core (not its glow tail)
// ends — i.e. where sampled alpha first drops below the "filled" threshold.
async function measureEdgeDistances(page) {
  return page.evaluate(({ threshold }) => {
    const canvas = document.getElementById('probe');
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    function scan(dx, dy) {
      for (let d = 0; d < canvas.width / 2; d++) {
        const x = Math.round(cx + dx * d);
        const y = Math.round(cy + dy * d);
        const alpha = ctx.getImageData(x, y, 1, 1).data[3];
        if (alpha <= threshold) return d - 1;
      }
      return canvas.width / 2;
    }

    return {
      up: scan(0, -1),
      down: scan(0, 1),
      left: scan(-1, 0),
      right: scan(1, 0),
    };
  }, { threshold: SHAPE_FILL_ALPHA_THRESHOLD });
}

Then('its bounding box is symmetric on both axes around its centre', async function () {
  const { up, down, left, right } = await measureEdgeDistances(this.page);
  assert.ok(
    Math.abs(up - down) <= CENTERING_TOLERANCE_PX,
    `vertical extents differ (up=${up}px, down=${down}px) — not centred on the vertical axis`
  );
  assert.ok(
    Math.abs(left - right) <= CENTERING_TOLERANCE_PX,
    `horizontal extents differ (left=${left}px, right=${right}px) — not centred on the horizontal axis`
  );
});

Then('all four of its sides are equal length', async function () {
  const { up, down, left, right } = await measureEdgeDistances(this.page);
  const distances = { up, down, left, right };
  const values = Object.values(distances);
  const max = Math.max(...values);
  const min = Math.min(...values);
  assert.ok(
    max - min <= CENTERING_TOLERANCE_PX,
    `cardinal vertex distances are not equal: ${JSON.stringify(distances)} — not an equilateral diamond`
  );
});

Then("it has a flat top edge unlike the yellow gem's pointed apex", async function () {
  const { up } = await measureEdgeDistances(this.page);
  const result = await this.page.evaluate(
    ({ topDistance, threshold }) => {
      const canvas = document.getElementById('probe');
      const ctx = canvas.getContext('2d');
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const y = Math.round(cy - topDistance * 0.9);
      const alphaAt = (x) => ctx.getImageData(x, y, 1, 1).data[3];
      return {
        left: alphaAt(Math.round(cx - topDistance * 0.3)),
        right: alphaAt(Math.round(cx + topDistance * 0.3)),
        threshold,
      };
    },
    { topDistance: up, threshold: SHAPE_FILL_ALPHA_THRESHOLD }
  );
  assert.ok(
    result.left > result.threshold && result.right > result.threshold,
    `expected both sides of the near-top edge to be filled (a flat table edge), got left=${result.left}, right=${result.right}`
  );
});
