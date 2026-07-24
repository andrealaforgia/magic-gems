import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMagicGems } from '../support/load-src.js';

const { GEM_TYPES, GEM_COLORS } = loadMagicGems([
  new URL('../../src/gems.js', import.meta.url),
]);

const RETIRED_GEM_TYPES = ['green-circle', 'blue-diamond', 'white-circle'];

test('GEM_TYPES has exactly seven distinct identities (SPEC 2)', () => {
  assert.equal(GEM_TYPES.length, 7);
  assert.equal(new Set(GEM_TYPES).size, GEM_TYPES.length, 'expected no duplicate identities');
});

test('every gem identity follows the shape+colour naming pattern (lowercase, hyphenated words)', () => {
  for (const gemType of GEM_TYPES) {
    assert.match(gemType, /^[a-z]+-[a-z]+$/, `"${gemType}" doesn't match the expected identity naming pattern`);
  }
});

test('none of the retired vector gem identities remain', () => {
  for (const retired of RETIRED_GEM_TYPES) {
    assert.ok(!GEM_TYPES.includes(retired), `retired identity "${retired}" must not appear in GEM_TYPES`);
  }
});

test('GEM_COLORS has exactly one entry per gem type, no stale or missing entries', () => {
  assert.deepEqual([...Object.keys(GEM_COLORS)].sort(), [...GEM_TYPES].sort());
});
