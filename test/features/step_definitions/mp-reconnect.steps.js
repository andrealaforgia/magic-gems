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
