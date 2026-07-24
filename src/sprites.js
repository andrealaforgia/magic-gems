(function (global) {
  'use strict';

  const { GEM_TYPES } = global.MagicGems;
  const SPRITE_BASE_PATH = 'assets/gems';
  // Gems rest completely still (SPEC 9.1) - only the face-on frame is ever shown.
  const FACE_FRAME_FILE = 'frame-00.png';

  function spriteUrl(gemType) {
    return `${SPRITE_BASE_PATH}/${gemType}/${FACE_FRAME_FILE}`;
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
    const images = await Promise.all(gemTypes.map((gemType) => loadImage(spriteUrl(gemType))));
    const sprites = {};
    gemTypes.forEach((gemType, i) => {
      sprites[gemType] = images[i];
    });
    return sprites;
  }

  global.MagicGems.spriteUrl = spriteUrl;
  global.MagicGems.loadGemSprites = loadGemSprites;
})(typeof window !== 'undefined' ? window : globalThis);
