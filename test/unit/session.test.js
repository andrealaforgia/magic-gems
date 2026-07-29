import { test } from 'node:test';
import assert from 'node:assert';
import { loadMagicGems } from '../support/load-src.js';

const {
  CODE_LENGTH,
  generateSessionCode,
  createSession,
  joinSession,
  isSessionReady,
  recordSnapshot,
  recordSurrender,
} = loadMagicGems([new URL('../../src/session.js', import.meta.url)]);

test('generateSessionCode returns a 10-letter uppercase code (SPEC 13.2.2)', () => {
  const code = generateSessionCode();
  assert.equal(code.length, CODE_LENGTH);
  assert.equal(code.length, 10);
  assert.ok(/^[A-Z]{10}$/.test(code), `expected 10 uppercase letters, got "${code}"`);
});

test('generateSessionCode draws a fresh Math.random value for every one of its 10 characters, not just the first (QA review, commit e9d7a3d)', () => {
  // Pins all 10 draws at once, each to a distinct letter (A..J) - a
  // partially-hardcoded implementation (a real random first character, then a
  // fixed constant for the rest) would diverge from this exact string at
  // position 1 onward and get caught, which a check of position 0 alone
  // could never distinguish from a fully-random implementation.
  const queue = Array.from({ length: 10 }, (_, i) => (i + 0.5) / 26);
  const { generateSessionCode: gen } = loadMagicGems(
    [new URL('../../src/session.js', import.meta.url)],
    { randomQueue: queue }
  );
  assert.equal(gen(), 'ABCDEFGHIJ');
});

test('createSession starts a session with exactly the host as its one player', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  assert.equal(session.code, 'ABCDEFGHIJ');
  assert.deepEqual(session.players, ['Alice']);
});

test('joinSession against a missing session reports not-found and never fabricates a session', () => {
  const result = joinSession(null, 'Bob');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'not-found');
  assert.equal(result.session, undefined);
});

test('joinSession appends the second player without touching the host, and reports ok', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const result = joinSession(session, 'Bob');
  assert.equal(result.ok, true);
  assert.deepEqual(result.session.players, ['Alice', 'Bob']);
  assert.deepEqual(session.players, ['Alice'], 'joinSession must never mutate the session it was given');
});

test('joinSession refuses a third player - a session already at 2 reports full', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const { session: joined } = joinSession(session, 'Bob');
  const result = joinSession(joined, 'Carol');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'full');
  assert.deepEqual(joined.players, ['Alice', 'Bob'], 'a refused join must never touch the existing session');
});

// MP-RECONNECT/SPEC 13.2.6: mirrors _session-logic.mjs's own coverage of the
// server-side copy.
test('joinSession treats a name already in the session as reconnecting, reclaiming their place rather than being rejected', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const { session: joined } = joinSession(session, 'Bob');

  const result = joinSession(joined, 'Bob');

  assert.equal(result.ok, true);
  assert.deepEqual(result.session.players, ['Alice', 'Bob']);
});

test('joinSession lets the host reconnect to their own still-waiting session under their own name', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');

  const result = joinSession(session, 'Alice');

  assert.equal(result.ok, true);
  assert.deepEqual(result.session.players, ['Alice']);
});

test('isSessionReady is true only once exactly two players are present', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  assert.equal(isSessionReady(session), false);
  const { session: joined } = joinSession(session, 'Bob');
  assert.equal(isSessionReady(joined), true);
});

test('isSessionReady is false for a missing session, never throws', () => {
  assert.equal(isSessionReady(null), false);
});

// MP-SYNC-SNAPSHOT/SPEC 13.4 (rewritten): mirrors _session-logic.mjs's own
// coverage of the server-side copy.
test('recordSnapshot stores a player\'s board and score under their own name, without touching the other player\'s', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const { session: joined } = joinSession(session, 'Bob');

  const result = recordSnapshot(joined, 'Alice', { board: [['red-square']], score: 40, sequence: 0 });

  assert.equal(result.ok, true);
  assert.deepEqual(result.session.snapshots.Alice, { board: [['red-square']], score: 40, sequence: 0 });
  assert.equal(result.session.snapshots.Bob, undefined, 'must not fabricate a snapshot for the other player');
  assert.deepEqual(joined.players, ['Alice', 'Bob'], 'must never mutate the session it was given');
});

test('recordSnapshot replaces the player\'s own previous snapshot as later sequences arrive in order, and never touches the other player\'s', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const { session: joined } = joinSession(session, 'Bob');
  const afterBob = recordSnapshot(joined, 'Bob', { board: [['blue-teardrop']], score: 5, sequence: 0 }).session;

  const afterAlice1 = recordSnapshot(afterBob, 'Alice', { board: [['red-square']], score: 10, sequence: 0 }).session;
  const afterAlice2 = recordSnapshot(afterAlice1, 'Alice', { board: [['green-octagon']], score: 60, sequence: 1 }).session;

  assert.deepEqual(
    afterAlice2.snapshots.Alice,
    { board: [['green-octagon']], score: 60, sequence: 1 },
    'the newer in-order snapshot must replace the older one, not accumulate'
  );
  assert.deepEqual(
    afterAlice2.snapshots.Bob,
    { board: [['blue-teardrop']], score: 5, sequence: 0 },
    'the other player\'s own snapshot must survive untouched'
  );
});

// MP-SEQ-ORDER/SPEC 13.4.1-13.4.4 (slice 2 of 4): a light smoke test only -
// the full ordering/holding/bounded-wait coverage lives in
// _session-logic.mjs's own test file, kept in one place so the two copies
// can't drift if edited later.
test('recordSnapshot holds an update that arrives ahead of its predecessor, rather than applying it', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const { session: joined } = joinSession(session, 'Bob');
  const afterFirst = recordSnapshot(joined, 'Alice', { board: [['red-square']], score: 0, sequence: 0 }).session;

  const result = recordSnapshot(afterFirst, 'Alice', { board: [['green-octagon']], score: 60, sequence: 2 });

  assert.deepEqual(
    result.session.snapshots.Alice,
    { board: [['red-square']], score: 0, sequence: 0 },
    'the applied state must stay at the last in-order update, not jump ahead'
  );
});

// Mirrors _session-logic.mjs's own coverage of the same contract on the
// server-side copy - see that test's own comment for the full rationale on
// what this does and doesn't guarantee (kept in one place so the two can't
// drift if edited later).
test('recordSnapshot does not mutate the snapshot object the caller passed in', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const board = [['red-square']];
  const snapshot = { board, score: 10, sequence: 0 };

  recordSnapshot(session, 'Alice', snapshot);

  assert.deepEqual(board, [['red-square']]);
  assert.deepEqual(snapshot, { board: [['red-square']], score: 10, sequence: 0 });
});

// Security review (commit be737cd), Finding 1 pattern: mirrors
// _session-logic.mjs's own coverage of the same fix on the server-side copy.
test('recordSnapshot refuses to record a snapshot for a name that isn\'t actually one of the session\'s players', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const { session: joined } = joinSession(session, 'Bob');

  const result = recordSnapshot(joined, 'Mallory', { board: [['red-square']], score: 0, sequence: 0 });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'not-a-player');
  assert.equal(joined.snapshots, undefined, 'a refused snapshot must never touch the existing session');
});

// MP5/SPEC 13.5.1: mirrors _session-logic.mjs's own coverage of the
// server-side copy.
test('recordSurrender records which player surrendered, without touching anything else', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const { session: joined } = joinSession(session, 'Bob');

  const result = recordSurrender(joined, 'Alice');

  assert.equal(result.ok, true);
  assert.equal(result.session.surrenderedBy, 'Alice');
  assert.deepEqual(joined.players, ['Alice', 'Bob'], 'must never mutate the session it was given');
});

test('recordSurrender is idempotent - a second surrender never overwrites the first', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const { session: joined } = joinSession(session, 'Bob');
  const afterAlice = recordSurrender(joined, 'Alice').session;

  const result = recordSurrender(afterAlice, 'Bob');

  assert.equal(result.ok, true);
  assert.equal(result.session.surrenderedBy, 'Alice', 'the first surrender must stand, not the second');
});

test('recordSurrender refuses to record a surrender for a name that isn\'t actually one of the session\'s players', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const { session: joined } = joinSession(session, 'Bob');

  const result = recordSurrender(joined, 'Mallory');

  assert.equal(result.ok, false);
  assert.equal(result.error, 'not-a-player');
  assert.equal(joined.surrenderedBy, undefined, 'a refused surrender must never touch the existing session');
});
