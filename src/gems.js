(function (global) {
  'use strict';

  const GEM_TYPES = Object.freeze([
    'purple-triangle',
    'red-square',
    'green-circle',
    'yellow-diamond',
    'blue-diamond',
    'white-circle',
  ]);

  const GEM_COLORS = Object.freeze({
    'purple-triangle': '#b544ff',
    'red-square': '#ff2d55',
    'green-circle': '#39ff8f',
    'yellow-diamond': '#f9ff3d',
    'blue-diamond': '#33baff',
    'white-circle': '#f2f6ff',
  });

  global.MagicGems = global.MagicGems || {};
  global.MagicGems.GEM_TYPES = GEM_TYPES;
  global.MagicGems.GEM_COLORS = GEM_COLORS;
})(typeof window !== 'undefined' ? window : globalThis);
