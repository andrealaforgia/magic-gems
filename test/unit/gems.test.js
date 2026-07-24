import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMagicGems } from '../support/load-src.js';

const { GEM_TYPES, GEM_COLORS } = loadMagicGems([
  new URL('../../src/gems.js', import.meta.url),
]);

const EXPECTED_GEM_TYPES = [
  'blue-teardrop',
  'green-octagon',
  'orange-hexagon',
  'purple-triangle',
  'red-square',
  'silver-octagon',
  'yellow-diamond',
];

const RETIRED_GEM_TYPES = ['green-circle', 'blue-diamond', 'white-circle'];

test('GEM_TYPES is exactly the seven sprite identities, no more and no fewer', () => {
  assert.deepEqual([...GEM_TYPES].sort(), [...EXPECTED_GEM_TYPES].sort());
});

test('none of the retired vector gem identities remain', () => {
  for (const retired of RETIRED_GEM_TYPES) {
    assert.ok(!GEM_TYPES.includes(retired), `retired identity "${retired}" must not appear in GEM_TYPES`);
  }
});

test('GEM_COLORS has exactly one entry per gem type, no stale or missing entries', () => {
  assert.deepEqual([...Object.keys(GEM_COLORS)].sort(), [...GEM_TYPES].sort());
});
