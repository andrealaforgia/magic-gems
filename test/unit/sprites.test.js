import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMagicGems } from '../support/load-src.js';

const { spriteUrl, FRAME_COUNT, GEM_TYPES } = loadMagicGems([
  new URL('../../src/gems.js', import.meta.url),
  new URL('../../src/spin.js', import.meta.url),
  new URL('../../src/sprites.js', import.meta.url),
]);

const ASSET_PATH_PATTERN = /^assets\/gems\/([a-z-]+)\/frame-(\d{2})\.png$/;

test('spriteUrl resolves to a path scoped to the gem\'s own folder with a round-tripping, two-digit frame number', () => {
  for (const gemType of GEM_TYPES) {
    for (let frame = 0; frame < FRAME_COUNT; frame++) {
      const url = spriteUrl(gemType, frame);
      const match = url.match(ASSET_PATH_PATTERN);
      assert.ok(match, `spriteUrl(${gemType}, ${frame}) = "${url}" doesn't match the expected asset path shape`);
      assert.equal(match[1], gemType, 'the path must be scoped to the requested gem\'s own folder');
      assert.equal(Number(match[2]), frame, 'the embedded frame number must round-trip to the requested frame index');
    }
  }
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
