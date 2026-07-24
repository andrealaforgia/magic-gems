import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

Then('the multiplier bar has a thick white border', async function () {
  const result = await this.page.evaluate(() => {
    const style = getComputedStyle(document.getElementById('multiplier-bar'));
    return {
      borderColor: style.borderTopColor,
      borderWidth: parseFloat(style.borderTopWidth),
    };
  });
  assert.equal(result.borderColor, 'rgb(255, 255, 255)', `expected a white border, got "${result.borderColor}"`);
  assert.ok(result.borderWidth >= 3, `expected a thick border (>=3px), got ${result.borderWidth}px`);
});
