import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

const MESSAGE_PREFIX = 'Score multiplier going down! Hurry up! x';

function readMultiplierMessage(page) {
  return page.evaluate(() => document.getElementById('multiplier-message').textContent);
}

Then('the multiplier box shows {string} in white', async function (expectedText) {
  const [text, color] = await Promise.all([
    readMultiplierMessage(this.page),
    this.page.evaluate(() => getComputedStyle(document.getElementById('multiplier-message')).color),
  ]);
  assert.equal(text, expectedText);
  assert.equal(color, 'rgb(255, 255, 255)');
});

Then('the multiplier message shows the number {int} right now', async function (expected) {
  const text = await readMultiplierMessage(this.page);
  assert.equal(text, `${MESSAGE_PREFIX}${expected}`);
});

// Compared at the same instant, straight from the DOM (not re-derived), so a
// change to either the message or the fill's own update path independently would
// surface here (SPEC 10.9.1).
Then('the multiplier message\'s number always matches the bar\'s own value', async function () {
  const [text, barValue] = await Promise.all([
    readMultiplierMessage(this.page),
    this.page.evaluate(() => Number(document.getElementById('multiplier-fill').dataset.multiplier)),
  ]);
  const shown = Number(text.slice(MESSAGE_PREFIX.length));
  assert.equal(shown, barValue, `expected the message's number (${shown}) to match the bar's own value (${barValue})`);
});

// Calls the live page's own real computeTimeMultiplier/multiplierMessage functions
// with a real elapsed time past the 100s drain window, rather than waiting that long
// - the same component-style proof bonus-tune.feature's own decayed-to-0 scenario
// uses for the identical timing claim.
Then('the multiplier message for a real elapsed time past the drain window reads {string}', async function (expectedText) {
  const message = await this.page.evaluate(() => {
    const { computeTimeMultiplier, multiplierMessage } = window.MagicGems;
    return multiplierMessage(computeTimeMultiplier(150000));
  });
  assert.equal(message, expectedText);
});

Then('the multiplier message text is white with a contrast outline, sitting within the bar\'s own box', async function () {
  const result = await this.page.evaluate(() => {
    const messageEl = document.getElementById('multiplier-message');
    const barEl = document.getElementById('multiplier-bar');
    const style = getComputedStyle(messageEl);
    const messageRect = messageEl.getBoundingClientRect();
    const barRect = barEl.getBoundingClientRect();
    return {
      color: style.color,
      textShadow: style.textShadow,
      withinBar:
        messageRect.left >= barRect.left - 1 &&
        messageRect.right <= barRect.right + 1 &&
        messageRect.top >= barRect.top - 1 &&
        messageRect.bottom <= barRect.bottom + 1,
    };
  });
  assert.equal(result.color, 'rgb(255, 255, 255)');
  assert.notEqual(result.textShadow, 'none', 'expected a contrast-enhancing text-shadow so the message stays legible against every gradient colour (SPEC 10.9.3)');
  assert.ok(result.withinBar, 'expected the message to sit within the multiplier bar\'s own box');
});
