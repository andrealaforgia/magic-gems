import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMagicGems } from '../support/load-src.js';

const { GEM_TYPES } = loadMagicGems([
  new URL('../../src/gems.js', import.meta.url),
]);

const RETIRED_GEM_TYPES = ['green-circle', 'blue-diamond', 'white-circle'];

// SPEC 2.1-2.7: this is the frozen spec's own roster, not a mirror of src/gems.js -
// pinning against it (rather than just checking shape/count) is what actually
// catches e.g. a silent rename that still "looks like" a valid identity.
const SPEC_2_GEM_TYPES = [
  'blue-teardrop',
  'green-octagon',
  'orange-hexagon',
  'purple-triangle',
  'red-square',
  'silver-octagon',
  'yellow-diamond',
];

test('GEM_TYPES is exactly the SPEC 2.1-2.7 roster', () => {
  assert.deepEqual([...GEM_TYPES].sort(), [...SPEC_2_GEM_TYPES].sort());
});

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
