import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { loadMagicGems } from '../../support/load-src.js';

// Reuse the real production identity list/frame count (not a hand-copied
// duplicate) so this file can never drift out of sync with src/gems.js / src/spin.js.
const { GEM_TYPES, FRAME_COUNT } = loadMagicGems([
  new URL('../../../src/gems.js', import.meta.url),
  new URL('../../../src/spin.js', import.meta.url),
]);

Then('each of the seven gem identities is backed by its own full set of real rotation-frame sprite images', async function () {
  const spriteInfo = await this.page.evaluate(
    ({ gemTypes, frameCount }) => {
      const sprites = window.MagicGems.getSpriteImages();
      return gemTypes.map((gemType) => {
        const frames = sprites[gemType] || [];
        return {
          gemType,
          frameCount: frames.length,
          allReal: frames.every((img, i) => img && img.naturalWidth > 0 && img.naturalHeight > 0 && img.src.endsWith(`/assets/gems/${gemType}/frame-${String(i).padStart(2, '0')}.png`)),
        };
      });
    },
    { gemTypes: GEM_TYPES, frameCount: FRAME_COUNT }
  );

  assert.equal(spriteInfo.length, 7, `expected exactly seven gem identities, got ${spriteInfo.length}`);
  for (const info of spriteInfo) {
    assert.equal(info.frameCount, FRAME_COUNT, `expected ${FRAME_COUNT} loaded frames for "${info.gemType}", got ${info.frameCount}`);
    assert.ok(info.allReal, `not every frame for "${info.gemType}" is backed by its own real, correctly-pathed sprite asset`);
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
