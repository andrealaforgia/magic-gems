import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

function pageFor(world, which) {
  return which === 'first' ? world.pageA : world.pageB;
}

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
