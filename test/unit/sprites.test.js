import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMagicGems } from '../support/load-src.js';

const { spriteUrl, FRAME_COUNT, GEM_TYPES } = loadMagicGems([
  new URL('../../src/gems.js', import.meta.url),
  new URL('../../src/spin.js', import.meta.url),
  new URL('../../src/sprites.js', import.meta.url),
]);

test('spriteUrl resolves each frame of a gem\'s rotation sequence to its own asset', () => {
  assert.equal(spriteUrl('red-square', 0), 'assets/gems/red-square/frame-00.png');
  assert.equal(spriteUrl('red-square', 9), 'assets/gems/red-square/frame-09.png');
  assert.equal(spriteUrl('blue-teardrop', 14), 'assets/gems/blue-teardrop/frame-14.png');
});

test('spriteUrl gives every (gem type, frame) pair its own distinct asset path', () => {
  const urls = [];
  for (const gemType of GEM_TYPES) {
    for (let frame = 0; frame < FRAME_COUNT; frame++) {
      urls.push(spriteUrl(gemType, frame));
    }
  }
  assert.equal(new Set(urls).size, GEM_TYPES.length * FRAME_COUNT, 'expected a distinct path per (gem type, frame) pair');
});
