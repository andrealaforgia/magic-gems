// Test-only fixture: loaded into the SAME vm sandbox as the module under
// test (see load-src.js), so this probe's own Math reference resolves in
// that sandbox's realm - unlike a probing function written directly in an
// outer test file, which would always see the outer realm's Math and could
// never observe a sandboxed module's own Math.random swap, no matter what
// that module actually does internally.
(function (global) {
  'use strict';

  global.MagicGems = global.MagicGems || {};
  global.MagicGems.readMathRandom = function () {
    return Math.random();
  };
  global.MagicGems.getMathRandomRef = function () {
    return Math.random;
  };
})(typeof window !== 'undefined' ? window : globalThis);
