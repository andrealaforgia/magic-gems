import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

// Compares against the bar's own CONTENT-box left edge (inside its border), not
// its outer getBoundingClientRect() left - otherwise the bar's own border width
// (thick and white per BAR-FRAME) reads as a false "gap" between it and the fill.
function readEdges(page) {
  return page.evaluate(() => {
    const barEl = document.getElementById('multiplier-bar');
    const barRect = barEl.getBoundingClientRect();
    const borderLeftWidth = parseFloat(getComputedStyle(barEl).borderLeftWidth);
    const fillRect = document.getElementById('multiplier-fill').getBoundingClientRect();
    return { barContentLeft: barRect.left + borderLeftWidth, fillLeft: fillRect.left, fillRight: fillRect.right };
  });
}

Then('the multiplier bar\'s fill is anchored to the bar\'s left edge', async function () {
  const { barContentLeft, fillLeft } = await readEdges(this.page);
  const gap = fillLeft - barContentLeft;
  assert.ok(Math.abs(gap) < 2, `expected the fill's left edge flush against the bar's left edge, gap was ${gap}px`);
});

Then(
  'the multiplier bar\'s fill visibly shrinks from the right, its left edge staying put, after a short real interval',
  async function () {
    const before = await readEdges(this.page);
    await this.page.waitForTimeout(1100);
    const after = await readEdges(this.page);
    assert.ok(
      after.fillRight < before.fillRight,
      `expected the fill's right edge to move left as it shrinks, was ${before.fillRight}, still ${after.fillRight}`
    );
    assert.ok(
      Math.abs(after.fillLeft - before.barContentLeft) < 2,
      `expected the fill's left edge to stay anchored to the bar's left edge, was ${after.fillLeft} vs bar left ${before.barContentLeft}`
    );
  }
);
