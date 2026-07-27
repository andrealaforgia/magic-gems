import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { getStaticBaseUrl } from '../support/static-server.js';

// MP-RECONNECT/SPEC 13.2.6: a genuinely new browser tab/page - the same
// simulation of "closed and came back" already established by this file's
// own sibling scenarios opening pageA/pageB from a shared context.
When('a new page enters the lobby, types the name {string}, and enters that same code', async function (name) {
  this.reconnectPage = await this.pageA.context().newPage();
  await this.reconnectPage.goto(`${getStaticBaseUrl()}/index.html`);
  await this.reconnectPage.click('#start-multiplayer-btn');
  await this.reconnectPage.waitForSelector('#mp-name-step:not([hidden])');
  await this.reconnectPage.keyboard.type(name);
  await this.reconnectPage.keyboard.press('Enter');
  await this.reconnectPage.keyboard.press('ArrowDown');
  await this.reconnectPage.keyboard.press('Enter');
  await this.reconnectPage.waitForSelector('#mp-enter-step:not([hidden])');
  await this.reconnectPage.keyboard.type(this.generatedCode);
  await this.reconnectPage.keyboard.press('Enter');
});

Then('that new page also reaches the ready state showing {string}', async function (expectedNames) {
  await this.reconnectPage.waitForSelector('#mp-ready-step:not([hidden])', { timeout: 6000 });
  const names = await this.reconnectPage.textContent('#mp-ready-names');
  assert.equal(names, expectedNames);
});

Then('that new page reports the session is full', async function () {
  await this.reconnectPage.waitForFunction(
    () => document.getElementById('mp-enter-error').textContent.length > 0,
    null,
    { timeout: 3000 }
  );
  const errorText = await this.reconnectPage.textContent('#mp-enter-error');
  assert.equal(errorText, 'Session is full');
});

function pageFor(world, which) {
  return which === 'first' ? world.pageA : world.pageB;
}

Given("I record the {word} page's own local match score", async function (which) {
  this.recordedMatchScore = await pageFor(this, which).evaluate(() => window.MagicGems.getMatchScore());
});

// MP-REPLICA-ASYMMETRY: a literal page reload, not a fresh third page - this
// is what actually triggers the defect (client-side match state resetting
// while the same server-side session, moves included, persists). Reconnects
// via the SAME "enter code" path a genuinely new joiner would use, since
// the player's own name is already in the session (SPEC 13.2.6).
When('the {word} page reloads mid-match and reconnects', async function (which) {
  const page = pageFor(this, which);
  const name = which === 'first' ? 'Alice' : 'Bob';
  await page.reload();
  await page.click('#start-multiplayer-btn');
  await page.waitForSelector('#mp-name-step:not([hidden])');
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#mp-enter-step:not([hidden])');
  await page.keyboard.type(this.generatedCode);
  await page.keyboard.press('Enter');
  await page.waitForSelector('#match:not([hidden])', { timeout: 10000 });
});

// QA review (commit 534e374): reconnect replay re-runs the same stored
// moves through the same production scoring formula, but compressed into a
// near-instant loop instead of the original real-time gaps between
// completions - and computeCompletionScore's own time-multiplier only ever
// grows as the elapsed gap between completions shrinks. So the reconstructed
// score can never legitimately come in BELOW what was actually recorded
// live: a lower reconstructed score means moves were skipped or
// misreplayed, not an honest timing approximation. `score > 0` alone missed
// exactly that - e.g. replaying only the last move of a longer history
// would still pass it.
// QA review (commit e7546e6): this bound holds because each replayed step's
// own elapsed time stays under the scoring formula's 1-second decay window -
// true for any realistic replay, but a false failure is theoretically
// possible under severe CI/GC starvation across an unusually long history.
Then("the {word} page's own local match score is close to what was recorded before, not reset to zero", async function (which) {
  const score = await pageFor(this, which).evaluate(() => window.MagicGems.getMatchScore());
  assert.ok(
    score >= this.recordedMatchScore,
    `expected a real reconstructed score at least as high as what was recorded before reload (${this.recordedMatchScore}), got ${score}`
  );
});
