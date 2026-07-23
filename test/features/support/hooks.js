import { Before, After, BeforeAll, AfterAll } from '@cucumber/cucumber';
import { chromium } from 'playwright';

let browser;

BeforeAll(async function () {
  browser = await chromium.launch();
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
