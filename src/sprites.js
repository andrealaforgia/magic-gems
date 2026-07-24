(function (global) {
  'use strict';

  const { GEM_TYPES } = global.MagicGems;
  const SPRITE_BASE_PATH = 'assets/gems';
  // Only the face-on frame is used this iteration (SG1/E7); idle rotation through
  // the sprite's other 14 frames is a later behaviour, not built here.
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
