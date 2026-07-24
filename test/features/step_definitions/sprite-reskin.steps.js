import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { loadMagicGems } from '../../support/load-src.js';

// Reuse the real production identity list (not a hand-copied duplicate) so this
// file can never drift out of sync with src/gems.js.
const { GEM_TYPES } = loadMagicGems([new URL('../../../src/gems.js', import.meta.url)]);

Then('each of the seven gem identities is backed by its real frame-00 sprite image', async function () {
  const spriteInfo = await this.page.evaluate((gemTypes) => {
    const sprites = window.MagicGems.getSpriteImages();
    return gemTypes.map((gemType) => {
      const img = sprites[gemType];
      return {
        gemType,
        loaded: !!img,
        naturalWidth: img && img.naturalWidth,
        naturalHeight: img && img.naturalHeight,
        src: img && img.src,
      };
    });
  }, GEM_TYPES);

  assert.equal(spriteInfo.length, 7, `expected exactly seven gem identities, got ${spriteInfo.length}`);
  for (const info of spriteInfo) {
    assert.ok(info.loaded, `no sprite image loaded for "${info.gemType}"`);
    assert.ok(
      info.naturalWidth > 0 && info.naturalHeight > 0,
      `sprite for "${info.gemType}" has no real image data`
    );
    assert.ok(
      info.src.endsWith(`/assets/gems/${info.gemType}/frame-00.png`),
      `sprite for "${info.gemType}" is not backed by its own frame-00.png asset (got ${info.src})`
    );
  }
});

Then(
  "the reshuffled result's cells are all one of the seven sprite gem identities, never a retired one",
  async function () {
    for (const cell of this.reshuffledResult.flat()) {
      assert.ok(
        GEM_TYPES.includes(cell),
        `reshuffled cell holds "${cell}", which is not one of the seven sprite gem identities`
      );
    }
  }
);
