import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

function readEdges(page) {
  return page.evaluate(() => {
    const barRect = document.getElementById('multiplier-bar').getBoundingClientRect();
    const fillRect = document.getElementById('multiplier-fill').getBoundingClientRect();
    return { barRight: barRect.right, fillLeft: fillRect.left, fillRight: fillRect.right };
  });
}

Then('the multiplier bar\'s fill is anchored to the bar\'s right edge', async function () {
  const { barRight, fillRight } = await readEdges(this.page);
  const gap = barRight - fillRight;
  assert.ok(Math.abs(gap) < 2, `expected the fill's right edge flush against the bar's right edge, gap was ${gap}px`);
});

Then(
  'the multiplier bar\'s fill visibly shrinks from the left, its right edge staying put, after a short real interval',
  async function () {
    const before = await readEdges(this.page);
    await this.page.waitForTimeout(1100);
    const after = await readEdges(this.page);
    assert.ok(
      after.fillLeft > before.fillLeft,
      `expected the fill's left edge to move right as it shrinks, was ${before.fillLeft}, still ${after.fillLeft}`
    );
    assert.ok(
      Math.abs(after.fillRight - before.barRight) < 2,
      `expected the fill's right edge to stay anchored to the bar's right edge, was ${after.fillRight} vs bar right ${before.barRight}`
    );
  }
);
