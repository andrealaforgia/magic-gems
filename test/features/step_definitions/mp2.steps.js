import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const INDEX_HTML_URL = pathToFileURL(path.join(PROJECT_ROOT, 'index.html')).href;

When('I type {string} into the lobby name field', async function (text) {
  await this.page.keyboard.type(text);
});

When('I type {string} into the lobby code field', async function (text) {
  await this.page.keyboard.type(text);
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
  const text = await this.page.evaluate(() => document.getElementById('mp-enter-error').textContent);
  assert.ok(/not found/i.test(text), `expected a "not found" error, got "${text}"`);
});

async function enterLobbyAsMultiplayer(page) {
  await page.goto(INDEX_HTML_URL);
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
  await this.pageB.waitForSelector('#mp-ready-step:not([hidden])', { timeout: 3000 });
  await this.pageA.waitForSelector('#mp-ready-step:not([hidden])', { timeout: 3000 });
  const namesA = await this.pageA.textContent('#mp-ready-names');
  const namesB = await this.pageB.textContent('#mp-ready-names');
  assert.equal(namesA, expectedNames, 'expected the first page to show both real names');
  assert.equal(namesB, expectedNames, 'expected the second page to show both real names');
});
