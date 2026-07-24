(function (global) {
  'use strict';

  const { GEM_TYPES, FRAME_COUNT } = global.MagicGems;
  const SPRITE_BASE_PATH = 'assets/gems';

  function spriteUrl(gemType, frameIndex) {
    const frameFile = `frame-${String(frameIndex).padStart(2, '0')}.png`;
    return `${SPRITE_BASE_PATH}/${gemType}/${frameFile}`;
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`failed to load gem sprite: ${url}`));
      img.src = url;
    });
  }

  async function loadGemSprites(gemTypes = GEM_TYPES) {
    const sprites = {};
    await Promise.all(
      gemTypes.map(async (gemType) => {
        const frameIndices = Array.from({ length: FRAME_COUNT }, (_, i) => i);
        sprites[gemType] = await Promise.all(
          frameIndices.map((frameIndex) => loadImage(spriteUrl(gemType, frameIndex)))
        );
      })
    );
    return sprites;
  }

  global.MagicGems.spriteUrl = spriteUrl;
  global.MagicGems.loadGemSprites = loadGemSprites;
})(typeof window !== 'undefined' ? window : globalThis);
