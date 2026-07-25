import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { waitForBoardReady } from '../support/board-reader.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const INDEX_HTML_URL = pathToFileURL(path.join(PROJECT_ROOT, 'index.html')).href;

Given('I open {string} at the raw start screen, with no mode chosen yet', async function (_file) {
  await this.page.goto(INDEX_HTML_URL);
});

When('I choose {string} from the start screen', async function (label) {
  const buttonId = label === 'Single-player' ? '#start-single-btn' : '#start-multiplayer-btn';
  await this.page.click(buttonId);
});

Then('the start screen offers {string} and {string} in the pixel font', async function (labelA, labelB) {
  const result = await this.page.evaluate(async () => {
    await document.fonts.ready;
    const singleBtn = document.getElementById('start-single-btn');
    const multiplayerBtn = document.getElementById('start-multiplayer-btn');
    return {
      singleText: singleBtn.textContent,
      multiplayerText: multiplayerBtn.textContent,
      singleFont: getComputedStyle(singleBtn).fontFamily,
      multiplayerFont: getComputedStyle(multiplayerBtn).fontFamily,
      pixelFontLoaded: [...document.fonts].some((f) => f.family === 'Press Start 2P' && f.status === 'loaded'),
    };
  });
  assert.equal(result.singleText, labelA);
  assert.equal(result.multiplayerText, labelB);
  assert.ok(result.singleFont.includes('Press Start 2P'), `expected the pixel font, got "${result.singleFont}"`);
  assert.ok(result.multiplayerFont.includes('Press Start 2P'), `expected the pixel font, got "${result.multiplayerFont}"`);
  assert.ok(result.pixelFontLoaded, 'expected the "Press Start 2P" font to have actually loaded');
});

Then('the game board is not shown', async function () {
  const hidden = await this.page.evaluate(() => document.getElementById('game').hidden);
  assert.equal(hidden, true, 'expected the game board to be hidden until a mode is chosen');
});

Then('the game board is shown', async function () {
  const hidden = await this.page.evaluate(() => document.getElementById('game').hidden);
  assert.equal(hidden, false, 'expected the game board to be visible after choosing Single-player');
  await waitForBoardReady(this.page);
});

Then('the multiplayer placeholder screen is shown', async function () {
  const result = await this.page.evaluate(() => {
    const el = document.getElementById('mp-placeholder');
    return { hidden: el.hidden, text: el.textContent };
  });
  assert.equal(result.hidden, false, 'expected the multiplayer placeholder to be visible');
  assert.ok(result.text.length > 0, 'expected the placeholder to say something, not be empty');
});
