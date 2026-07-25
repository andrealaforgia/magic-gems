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
  // An explicit context (not the browser.newPage() shorthand) so MP2's own
  // cross-page scenario can open a second page sharing this same context's
  // localStorage via this.page.context().newPage() - the shorthand's own
  // default context doesn't support that (Playwright throws "Please use
  // browser.newContext()").
  this.context = await browser.newContext();
  this.page = await this.context.newPage();
  this.consoleErrors = [];
  this.page.on('console', (msg) => {
    if (msg.type() === 'error') this.consoleErrors.push(msg.text());
  });
  this.page.on('pageerror', (err) => this.consoleErrors.push(err.message));
});

After(async function () {
  await this.context.close();
});
