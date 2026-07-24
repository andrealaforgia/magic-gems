(function (global) {
  'use strict';

  const GEM_TYPES = Object.freeze([
    'blue-teardrop',
    'green-octagon',
    'orange-hexagon',
    'purple-triangle',
    'red-square',
    'silver-octagon',
    'yellow-diamond',
  ]);

  global.MagicGems = global.MagicGems || {};
  global.MagicGems.GEM_TYPES = GEM_TYPES;
})(typeof window !== 'undefined' ? window : globalThis);
