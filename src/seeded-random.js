(function (global) {
  'use strict';

  // SPEC 13.3.1: two independent clients joined to the same session code must
  // build the identical starting board - a small, deterministic,
  // non-cryptographic PRNG (mulberry32) stands in for Math.random for that
  // one purpose. Not for anything security-sensitive (session codes already
  // use real Math.random, SPEC 13.2.2).
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // A deterministic string hash (FNV-1a) - turns the shared session code into
  // a numeric seed both clients derive identically from the same string.
  function hashStringToSeed(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  function createSeededRandom(seed) {
    return mulberry32(seed);
  }

  // MP4-MOVES/SPEC 13.4: temporarily routes every Math.random() call inside
  // fn through randomFn instead - the seam that lets a remote replica's
  // board generation, cascade refills, and shatter-fragment velocities all
  // draw from its own seeded generator, never the ambient one driving local
  // play, so two independently-seeded replicas stay byte-identical.
  function withRandom(randomFn, fn) {
    const previous = Math.random;
    Math.random = randomFn;
    try {
      return fn();
    } finally {
      Math.random = previous;
    }
  }

  global.MagicGems = global.MagicGems || {};
  global.MagicGems.hashStringToSeed = hashStringToSeed;
  global.MagicGems.createSeededRandom = createSeededRandom;
  global.MagicGems.withRandom = withRandom;
})(typeof window !== 'undefined' ? window : globalThis);
