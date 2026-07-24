import { Before, After, BeforeAll, AfterAll } from '@cucumber/cucumber';
import { chromium } from 'playwright';

let browser;

BeforeAll(async function () {
  // Real players never call getImageData, so file:// asset loading works for them
  // with no flags. Our own pixel-sampling assertions do call it, and Chromium
  // taints a canvas the moment it draws a file:// image loaded from outside the
  // page's own directory unless this is set - test-only, doesn't affect the game.
  browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
});

AfterAll(async function () {
  await browser.close();
});

Before(async function () {
  this.page = await browser.newPage();
  this.consoleErrors = [];
  this.page.on('console', (msg) => {
    if (msg.type() === 'error') this.consoleErrors.push(msg.text());
  });
  this.page.on('pageerror', (err) => this.consoleErrors.push(err.message));
});

After(async function () {
  if (this.page) await this.page.close();
});
