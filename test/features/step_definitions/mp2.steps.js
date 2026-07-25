import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { getStaticBaseUrl } from '../support/static-server.js';

Given('I open the game over a real local server, at the raw start screen, with no mode chosen yet', async function () {
  await this.page.goto(`${getStaticBaseUrl()}/index.html`);
});

When('I type {string} into the lobby name field', async function (text) {
  await this.page.keyboard.type(text);
});

When('I type {string} into the lobby code field', async function (text) {
  await this.page.keyboard.type(text);
});

// MP2-STORE (commit e9d7a3d): overrides the default in-memory mock installed
// in Before with one that always fails, simulating an unreachable/
// misconfigured real store (E4) - registered after the default route, so
// Playwright's most-recently-registered-first matching gives this one
// precedence.
Given('the session store is simulated as unavailable', async function () {
  await this.context.route('**/api/magic-gems/session**', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'store unavailable' }) })
  );
});

// QA review (commit 023dece): simulates exactly one transient GET (status
// poll) failure - only the host's own subscribeSession loop ever issues a
// GET, so this reliably targets its first tick - then falls back to the
// default in-memory mock for everything after, proving the poll survives
// and recovers rather than getting stuck.
Given("the first page's next status poll will fail once, then succeed normally", async function () {
  let failedOnce = false;
  await this.context.route('**/api/magic-gems/session**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET' && !failedOnce) {
      failedOnce = true;
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'simulated transient poll failure' }),
      });
    }
    return route.fallback();
  });
});

Then("the lobby's {string} option is highlighted as selected", async function (label) {
  const buttonId = label === 'Generate code' ? '#mp-generate-btn' : '#mp-enter-btn';
  const otherButtonId = label === 'Generate code' ? '#mp-enter-btn' : '#mp-generate-btn';
  const result = await this.page.evaluate(
    ({ buttonId, otherButtonId }) => ({
      selected: document.querySelector(buttonId).classList.contains('selected'),
      otherSelected: document.querySelector(otherButtonId).classList.contains('selected'),
    }),
    { buttonId, otherButtonId }
  );
  assert.equal(result.selected, true, `expected "${label}" to be highlighted as selected`);
  assert.equal(result.otherSelected, false, 'expected only one option to be highlighted at a time');
});

Then('a random 10-letter code is displayed', async function () {
  // Generating a code is a real network round trip (create) - waits for it
  // to actually land rather than sampling immediately, which raced the
  // in-flight request often enough to be a real, not theoretical, flake.
  await this.page.waitForSelector('#mp-generate-step:not([hidden])', { timeout: 3000 });
  const result = await this.page.evaluate(() => ({
    hidden: document.getElementById('mp-generate-step').hidden,
    code: document.getElementById('mp-generated-code').textContent,
  }));
  assert.equal(result.hidden, false, 'expected the generate-code step to be visible');
  assert.ok(/^[A-Z]{10}$/.test(result.code), `expected a 10-letter uppercase code, got "${result.code}"`);
});

Then('the lobby shows it is waiting for a second player', async function () {
  const text = await this.page.evaluate(() => document.querySelector('.mp-lobby-status').textContent);
  assert.ok(/waiting/i.test(text), `expected a "waiting" status, got "${text}"`);
});

Then("the lobby's code entry step is shown", async function () {
  const hidden = await this.page.evaluate(() => document.getElementById('mp-enter-step').hidden);
  assert.equal(hidden, false, 'expected the code entry step to be visible');
});

Then('the lobby reports the code was not found', async function () {
  // Joining is a real network round trip - waits for the response to land
  // rather than sampling immediately.
  await this.page.waitForFunction(
    () => document.getElementById('mp-enter-error').textContent.length > 0,
    null,
    { timeout: 3000 }
  );
  const text = await this.page.evaluate(() => document.getElementById('mp-enter-error').textContent);
  assert.ok(/not found/i.test(text), `expected a "not found" error, got "${text}"`);
});

Then('the lobby shows a clear error instead of hanging', async function () {
  await this.page.waitForFunction(
    () => document.getElementById('mp-lobby-error').textContent.length > 0,
    null,
    { timeout: 3000 }
  );
  const text = await this.page.evaluate(() => document.getElementById('mp-lobby-error').textContent);
  assert.ok(text.length > 0, 'expected a non-empty lobby error message');
});

async function enterLobbyAsMultiplayer(page) {
  await page.goto(`${getStaticBaseUrl()}/index.html`);
  await page.click('#start-multiplayer-btn');
  await page.waitForSelector('#mp-name-step:not([hidden])');
}

Given("two independent pages are both at the multiplayer lobby's name entry step", async function () {
  this.pageA = this.page;
  this.pageB = await this.pageA.context().newPage();
  await enterLobbyAsMultiplayer(this.pageA);
  await enterLobbyAsMultiplayer(this.pageB);
});

When('the first page enters the name {string} and generates a code', async function (name) {
  await this.pageA.keyboard.type(name);
  await this.pageA.keyboard.press('Enter');
  await this.pageA.keyboard.press('Enter');
  await this.pageA.waitForSelector('#mp-generate-step:not([hidden])');
  this.generatedCode = await this.pageA.textContent('#mp-generated-code');
});

When('the second page enters the name {string} and enters that same code', async function (name) {
  await this.pageB.keyboard.type(name);
  await this.pageB.keyboard.press('Enter');
  await this.pageB.keyboard.press('ArrowDown');
  await this.pageB.keyboard.press('Enter');
  await this.pageB.waitForSelector('#mp-enter-step:not([hidden])');
  await this.pageB.keyboard.type(this.generatedCode);
  await this.pageB.keyboard.press('Enter');
});

Then('both pages reach the ready state showing {string}', async function (expectedNames) {
  // Generous enough to also cover a simulated failed poll tick elsewhere in
  // this file, which costs the host one extra polling interval before it
  // recovers and detects the join.
  await this.pageB.waitForSelector('#mp-ready-step:not([hidden])', { timeout: 6000 });
  await this.pageA.waitForSelector('#mp-ready-step:not([hidden])', { timeout: 6000 });
  const namesA = await this.pageA.textContent('#mp-ready-names');
  const namesB = await this.pageB.textContent('#mp-ready-names');
  assert.equal(namesA, expectedNames, 'expected the first page to show both real names');
  assert.equal(namesB, expectedNames, 'expected the second page to show both real names');
});
