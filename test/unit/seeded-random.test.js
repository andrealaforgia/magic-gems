import { test } from 'node:test';
import assert from 'node:assert';
import { loadMagicGems } from '../support/load-src.js';

const { hashStringToSeed, createSeededRandom, withRandom, readMathRandom, getMathRandomRef } = loadMagicGems([
  new URL('../../src/seeded-random.js', import.meta.url),
  new URL('../support/math-random-probe.js', import.meta.url),
]);

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

// MP4-MOVES/SPEC 13.4: withRandom is the seam that routes ALL of a
// remote-replica replay's Math.random consumption (board generation, cascade
// refills, shatter-fragment velocities) through its own seeded generator
// instead of the ambient one - this is the mechanism the whole architecture's
// "two independently-seeded replicas end up byte-identical" claim rests on,
// so it needs its own direct unit coverage rather than only being exercised
// indirectly through acceptance tests (QA review, #538).
test('withRandom runs fn with Math.random actually swapped to the given function, observed from another consumer', () => {
  const value = withRandom(() => 0.5, readMathRandom);
  assert.equal(value, 0.5);
});

test('withRandom returns fn\'s own return value', () => {
  const result = withRandom(() => 0.5, () => 'the fn result');
  assert.equal(result, 'the fn result');
});

test('withRandom restores the exact previous Math.random afterward', () => {
  const before = getMathRandomRef();
  withRandom(() => 0.5, () => {});
  assert.equal(getMathRandomRef(), before);
});

test('withRandom restores the previous Math.random even when fn throws', () => {
  const before = getMathRandomRef();
  assert.throws(() =>
    withRandom(() => 0.5, () => {
      throw new Error('boom');
    })
  );
  assert.equal(getMathRandomRef(), before);
});

test('withRandom lets two independently-seeded instances drive identical Math.random consumers to a byte-identical result', () => {
  const replicaA = createSeededRandom(42);
  const replicaB = createSeededRandom(42);

  function consumeThree() {
    return [readMathRandom(), readMathRandom(), readMathRandom()];
  }

  const resultA = withRandom(replicaA, consumeThree);
  const resultB = withRandom(replicaB, consumeThree);

  assert.deepEqual(resultA, resultB);
});
