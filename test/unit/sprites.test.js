import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMagicGems } from '../support/load-src.js';

const { spriteUrl, GEM_TYPES } = loadMagicGems([
  new URL('../../src/gems.js', import.meta.url),
  new URL('../../src/sprites.js', import.meta.url),
]);

const ASSET_PATH_PATTERN = /^assets\/gems\/([a-z-]+)\/frame-00\.png$/;

test('spriteUrl resolves to the gem\'s own face-on frame-00 asset, scoped to its own folder', () => {
  for (const gemType of GEM_TYPES) {
    const url = spriteUrl(gemType);
    const match = url.match(ASSET_PATH_PATTERN);
    assert.ok(match, `spriteUrl(${gemType}) = "${url}" doesn't match the expected asset path shape`);
    assert.equal(match[1], gemType, 'the path must be scoped to the requested gem\'s own folder');
  }
});

test('spriteUrl gives every gem type its own distinct asset path', () => {
  const urls = GEM_TYPES.map(spriteUrl);
  assert.equal(new Set(urls).size, GEM_TYPES.length, 'expected a distinct sprite path per gem type');
});
