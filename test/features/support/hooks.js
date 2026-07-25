import { Before, After, BeforeAll, AfterAll } from '@cucumber/cucumber';
import { chromium } from 'playwright';
import { startStaticServer, stopStaticServer } from './static-server.js';
import { installSessionApiMock } from './session-api-mock.js';

let browser;

BeforeAll(async function () {
  // Real players never call getImageData, so file:// asset loading works for them
  // with no flags. Our own pixel-sampling assertions do call it, and Chromium
  // taints a canvas the moment it draws a file:// image loaded from outside the
  // page's own directory unless this is set - test-only, doesn't affect the game.
  browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  // MP2-STORE's real REST client calls fetch() against a relative path, which
  // Chromium rejects outright for file:// pages before any request is even
  // attempted - a real (if local) http origin is needed for those scenarios.
  await startStaticServer();
});

AfterAll(async function () {
  await browser.close();
  await stopStaticServer();
});

Before(async function () {
  // An explicit context (not the browser.newPage() shorthand) so MP2's own
  // cross-page scenario can open a second page sharing this same context's
  // localStorage via this.page.context().newPage() - the shorthand's own
  // default context doesn't support that (Playwright throws "Please use
  // browser.newContext()").
  this.context = await browser.newContext();
  // Harmless for every scenario that never calls it - a realistic in-memory
  // stand-in for the real Upstash-backed session API, shared by any second
  // page opened in this same context (see session-api-mock.js).
  await installSessionApiMock(this.context);
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
