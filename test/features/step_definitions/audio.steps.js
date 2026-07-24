import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

async function soundLog(page) {
  return page.evaluate(() => window.MagicGems.getSoundLog());
}

function bundledSoundNames(page) {
  return page.evaluate(() => window.MagicGems.BUNDLED_SOUND_NAMES);
}

Then('the sound log includes {string}', async function (name) {
  const log = await soundLog(this.page);
  assert.ok(log.includes(name), `expected the sound log to include "${name}", got ${JSON.stringify(log)}`);
});

Then('the sound log does not include {string}', async function (name) {
  const log = await soundLog(this.page);
  assert.ok(!log.includes(name), `expected the sound log NOT to include "${name}", got ${JSON.stringify(log)}`);
});

Then('every entry in the sound log is one of the bundled discrete event sounds', async function () {
  const [log, bundled] = await Promise.all([soundLog(this.page), bundledSoundNames(this.page)]);
  assert.ok(log.length > 0, 'expected at least one sound to have played by now');
  for (const name of log) {
    assert.ok(bundled.includes(name), `"${name}" is not one of the bundled discrete event sounds - ${JSON.stringify(log)}`);
  }
});

Then('the live page\'s cascade tone for chain position {int} is tone number {int}', async function (chainPosition, tone) {
  const result = await this.page.evaluate(
    (cp) => window.MagicGems.cascadeToneIndex(cp),
    chainPosition
  );
  assert.equal(result, tone);
});

Then('the live page\'s cascade tone for chain position {int} is still tone number {int}, clamped', async function (chainPosition, tone) {
  const result = await this.page.evaluate(
    (cp) => window.MagicGems.cascadeToneIndex(cp),
    chainPosition
  );
  assert.equal(result, tone);
});
