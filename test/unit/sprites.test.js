import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMagicGems } from '../support/load-src.js';

const { spriteUrl } = loadMagicGems([
  new URL('../../src/gems.js', import.meta.url),
  new URL('../../src/sprites.js', import.meta.url),
]);

// This iteration only the face-on frame is used (SG1/E7: gems are static, no idle
// rotation yet) - locking spriteUrl to frame-00 is what keeps that true.
test('spriteUrl points at the gem\'s face-on frame-00 asset, not any other frame', () => {
  assert.equal(spriteUrl('red-square'), 'assets/gems/red-square/frame-00.png');
  assert.equal(spriteUrl('blue-teardrop'), 'assets/gems/blue-teardrop/frame-00.png');
});

test('spriteUrl gives every gem type its own asset path', () => {
  const { GEM_TYPES } = loadMagicGems([new URL('../../src/gems.js', import.meta.url)]);
  const urls = GEM_TYPES.map(spriteUrl);
  assert.equal(new Set(urls).size, GEM_TYPES.length, 'expected a distinct sprite path per gem type');
});
