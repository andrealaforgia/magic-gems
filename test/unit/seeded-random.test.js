import { test } from 'node:test';
import assert from 'node:assert';
import { loadMagicGems } from '../support/load-src.js';

const { hashStringToSeed, createSeededRandom } = loadMagicGems([new URL('../../src/seeded-random.js', import.meta.url)]);

test('hashStringToSeed is deterministic - the same string always hashes to the same seed', () => {
  assert.equal(hashStringToSeed('ABCDEFGHIJ'), hashStringToSeed('ABCDEFGHIJ'));
});

test('hashStringToSeed gives different codes different seeds (not a constant)', () => {
  assert.notEqual(hashStringToSeed('ABCDEFGHIJ'), hashStringToSeed('ZZZZZZZZZZ'));
});

test('hashStringToSeed returns a non-negative integer usable as a PRNG seed', () => {
  const seed = hashStringToSeed('ABCDEFGHIJ');
  assert.equal(Number.isInteger(seed), true);
  assert.ok(seed >= 0);
});

test('hashStringToSeed matches the exact known FNV-1a value for a fixed string (mutation-testing gap: determinism/variety checks alone let an off-by-one loop bound through undetected)', () => {
  assert.equal(hashStringToSeed('ABCDEFGHIJ'), 3434841778);
});

test('createSeededRandom always produces the same sequence of values for the same seed', () => {
  const a = createSeededRandom(42);
  const b = createSeededRandom(42);
  const sequenceA = Array.from({ length: 20 }, () => a());
  const sequenceB = Array.from({ length: 20 }, () => b());
  assert.deepEqual(sequenceA, sequenceB);
});

test('createSeededRandom matches the exact known mulberry32 sequence for a fixed seed (mutation-testing gap: determinism/range/variety checks alone let a wrong-but-internally-consistent PRNG variant through undetected)', () => {
  const random = createSeededRandom(42);
  assert.equal(random(), 0.6011037519201636);
  assert.equal(random(), 0.44829055899754167);
  assert.equal(random(), 0.8524657934904099);
});

test('createSeededRandom produces different sequences for different seeds', () => {
  const a = createSeededRandom(1);
  const b = createSeededRandom(2);
  assert.notEqual(a(), b());
});

test('createSeededRandom produces values in the same [0, 1) range Math.random does', () => {
  const random = createSeededRandom(7);
  for (let i = 0; i < 100; i++) {
    const value = random();
    assert.ok(value >= 0 && value < 1, `value ${value} out of [0,1) range`);
  }
});

test('createSeededRandom does not just repeat the same value forever (a real varying sequence)', () => {
  const random = createSeededRandom(7);
  const values = new Set(Array.from({ length: 20 }, () => random()));
  assert.ok(values.size > 1, 'expected the sequence to actually vary');
});

test('createSeededRandom lets two independently-seeded instances draw identical sequences (SPEC 13.3.1: two clients sharing a seed build the identical starting board)', () => {
  const a = createSeededRandom(42);
  const b = createSeededRandom(42);
  const drawThree = (random) => [random(), random(), random()];
  assert.deepEqual(drawThree(a), drawThree(b));
});
