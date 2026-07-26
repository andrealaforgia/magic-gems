import { test } from 'node:test';
import assert from 'node:assert';
import { loadMagicGems } from '../support/load-src.js';

const { createFragments, updateFragments, pruneOffscreen, computeSourceTile } = loadMagicGems([
  new URL('../../src/shatter.js', import.meta.url),
]);

// Matches src/shatter.js's own FRAGMENT_COUNT (not exported - pinned here deliberately).
const EXPECTED_FRAGMENT_COUNT = 8;

test('createFragments returns exactly the expected number of fragments, all starting at the given centre', () => {
  const fragments = createFragments(100, 200);
  assert.equal(fragments.length, EXPECTED_FRAGMENT_COUNT);
  for (const f of fragments) {
    assert.equal(f.x, 100);
    assert.equal(f.y, 200);
  }
});

test('createFragments spreads fragments both left and right, with a real range of motion', () => {
  const fragments = createFragments(0, 0);
  const vxValues = fragments.map((f) => f.vx);
  assert.ok(vxValues.some((vx) => vx > 0), 'at least one fragment must drift right');
  assert.ok(vxValues.some((vx) => vx < 0), 'at least one fragment must drift left');
  const spread = Math.max(...vxValues) - Math.min(...vxValues);
  assert.ok(spread > 20, `lateral spread was only ${spread}, too narrow to read as a real break-apart`);
});

test('createFragments gives every fragment a real, varied, downward initial fall speed', () => {
  const fragments = createFragments(0, 0);
  const vyValues = fragments.map((f) => f.vy);
  for (const vy of vyValues) {
    assert.ok(vy > 0, `fragment had non-downward initial vy=${vy} - a shatter must drift down, not up`);
  }
  const spread = Math.max(...vyValues) - Math.min(...vyValues);
  assert.ok(spread > 5, `fall-speed spread was only ${spread}, fragments look identical instead of varied`);
});

test('createFragments produces a different pattern on each call (randomised per occurrence)', () => {
  const first = createFragments(0, 0);
  const second = createFragments(0, 0);
  assert.notDeepEqual(
    first.map((f) => [f.vx, f.vy]),
    second.map((f) => [f.vx, f.vy]),
    'two separate shatters must not replay an identical fragment pattern'
  );
});

// MP4-FIX/SPEC 13.4.0: fragments are purely cosmetic (never fed back into
// board/score logic), so their own velocity draws must NOT share a call
// count with the deterministic stream a multiplayer match's board
// reconstruction depends on - an injectable randomFn (defaulting to
// Math.random, unchanged for single-player) lets both the local match and
// its remote replica route fragments through a dedicated, non-deterministic
// source instead, so a fragment draw can never shift the parity of a later
// refill draw between the two sides.
test('createFragments draws from an injected randomFn instead of the ambient Math.random, when given one', () => {
  const calls = [];
  const fixedRandom = () => {
    calls.push('call');
    return 0.5;
  };
  const fragments = createFragments(0, 0, fixedRandom);
  assert.equal(calls.length, EXPECTED_FRAGMENT_COUNT * 2, 'expected exactly 2 draws per fragment from the injected function');
  for (const f of fragments) {
    // MIN_FALL_SPEED=20, FALL_SPEED_RANGE=40, LATERAL_SPEED_RANGE=60 (src/shatter.js) -
    // a fixed 0.5 draw is the exact midpoint of both ranges.
    assert.equal(f.vx, 0);
    assert.equal(f.vy, 40);
  }
});

test('updateFragments moves each fragment horizontally by exactly vx * elapsed time', () => {
  const fragments = [{ x: 10, y: 20, vx: 5, vy: 8 }];
  const [moved] = updateFragments(fragments, 3);
  assert.equal(moved.x, 10 + 5 * 3);
});

test('updateFragments applies gravity before computing the vertical move (semi-implicit Euler)', () => {
  // Using dt=3 (not 1) so that multiplying vs dividing by dt actually produce
  // different numbers - dt=1 would make x*1 and x/1 coincidentally identical and
  // silently mask a multiply/divide mutation.
  const fragments = [{ x: 0, y: 20, vx: 0, vy: 8 }];
  const [moved] = updateFragments(fragments, 3);
  assert.ok(moved.vy > 8, 'vertical speed must increase from gravity over elapsed time');
  // The vertical displacement must be derived from the *new* (post-gravity) vy,
  // multiplied by dt - not the old vy, and not divided by dt.
  assert.equal(moved.y, 20 + moved.vy * 3);
});

test("gravity's contribution to vy scales linearly (multiplicatively) with elapsed time, not inversely", () => {
  // Checking the *relationship* between two different elapsed times, rather than
  // one dt against a hardcoded constant, catches a multiply-vs-divide-by-dt
  // mutation without needing to know GRAVITY_ACCEL's exact value: multiplying
  // doubles the contribution when dt doubles; dividing would halve it instead.
  const fragment = { x: 0, y: 0, vx: 0, vy: 100 };
  const [afterOneSecond] = updateFragments([fragment], 1);
  const [afterTwoSeconds] = updateFragments([fragment], 2);
  const gravityContributionAt1 = afterOneSecond.vy - 100;
  const gravityContributionAt2 = afterTwoSeconds.vy - 100;
  assert.equal(gravityContributionAt2, gravityContributionAt1 * 2);
});

test('pruneOffscreen removes fragments that have fallen past the given boundary', () => {
  const fragments = [
    { x: 0, y: 50, vx: 0, vy: 0 },
    { x: 0, y: 500, vx: 0, vy: 0 },
  ];
  const remaining = pruneOffscreen(fragments, 100);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].y, 50);
});

test('pruneOffscreen keeps a fragment exactly at the boundary', () => {
  const fragments = [{ x: 0, y: 100, vx: 0, vy: 0 }];
  const remaining = pruneOffscreen(fragments, 100);
  assert.equal(remaining.length, 1);
});

test('computeSourceTile partitions the sprite into a gapless, non-overlapping grid covering the whole image', () => {
  const imgWidth = 200;
  const imgHeight = 100;
  const tiles = Array.from({ length: EXPECTED_FRAGMENT_COUNT }, (_, i) => computeSourceTile(i, imgWidth, imgHeight));

  // Every tile lands fully within the source image's own bounds.
  for (const tile of tiles) {
    assert.ok(tile.sx >= 0 && tile.sy >= 0, 'a tile must not start outside the image');
    assert.ok(tile.sx + tile.sw <= imgWidth + 1e-9, 'a tile must not extend past the image\'s right edge');
    assert.ok(tile.sy + tile.sh <= imgHeight + 1e-9, 'a tile must not extend past the image\'s bottom edge');
  }

  // No two tiles overlap, and together they cover the full image area exactly once.
  const totalTileArea = tiles.reduce((sum, t) => sum + t.sw * t.sh, 0);
  assert.equal(totalTileArea, imgWidth * imgHeight);
  const uniqueOrigins = new Set(tiles.map((t) => `${t.sx},${t.sy}`));
  assert.equal(uniqueOrigins.size, EXPECTED_FRAGMENT_COUNT, 'expected every fragment to get its own distinct region of the sprite');
});

test('computeSourceTile places a non-corner tile at its exact grid origin', () => {
  // Index 5 in a 4-wide grid is row 1, col 1 - both non-zero, so a multiply-vs-divide
  // mistake in either axis produces a different, detectable origin here (unlike
  // col=0/row=0 tiles, where multiplying and dividing coincidentally agree at 0).
  const imgWidth = 200;
  const imgHeight = 100;
  const tile = computeSourceTile(5, imgWidth, imgHeight);
  assert.deepEqual(tile, { sx: 50, sy: 50, sw: 50, sh: 50 });
});

test('computeSourceTile scales its tile size with the image, keeping the same relative slice', () => {
  const small = computeSourceTile(0, 40, 20);
  const big = computeSourceTile(0, 80, 40);
  assert.equal(big.sw, small.sw * 2);
  assert.equal(big.sh, small.sh * 2);
});
