import { test } from 'node:test';
import assert from 'node:assert';
import { loadMagicGems } from '../support/load-src.js';

const { CODE_LENGTH, generateSessionCode, createSession, joinSession, isSessionReady, publishPlayerState } =
  loadMagicGems([new URL('../../src/session.js', import.meta.url)]);

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

// MP4: mirrors _session-logic.mjs's own coverage of the server-side copy.
test('publishPlayerState records a player\'s board and score under their own name, without touching the other player\'s', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const { session: joined } = joinSession(session, 'Bob');
  const board = [['red-square']];

  const result = publishPlayerState(joined, 'Alice', board, 42);

  assert.equal(result.ok, true);
  assert.deepEqual(result.session.states.Alice, { board, score: 42 });
  assert.equal(result.session.states.Bob, undefined, 'must not fabricate a state for the other player');
  assert.deepEqual(joined.players, ['Alice', 'Bob'], 'must never mutate the session it was given');
});

test('publishPlayerState updates a previously-published state, and never touches the other player\'s', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const { session: joined } = joinSession(session, 'Bob');
  const afterBob = publishPlayerState(joined, 'Bob', [['blue-diamond']], 10).session;

  const afterAlice = publishPlayerState(afterBob, 'Alice', [['red-square']], 20).session;
  const afterAliceAgain = publishPlayerState(afterAlice, 'Alice', [['green-octagon']], 30).session;

  assert.deepEqual(afterAliceAgain.states.Alice, { board: [['green-octagon']], score: 30 });
  assert.deepEqual(afterAliceAgain.states.Bob, { board: [['blue-diamond']], score: 10 }, 'the other player\'s last-published state must survive untouched');
});

test('publishPlayerState never mutates the board array it was given', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const board = [['red-square']];

  publishPlayerState(session, 'Alice', board, 5);

  assert.deepEqual(board, [['red-square']]);
});

// Security review (commit be737cd), Finding 1: mirrors _session-logic.mjs's
// own coverage of the same fix on the server-side copy.
test('publishPlayerState refuses to publish for a name that isn\'t actually one of the session\'s players', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const { session: joined } = joinSession(session, 'Bob');

  const result = publishPlayerState(joined, 'Mallory', [['red-square']], 5);

  assert.equal(result.ok, false);
  assert.equal(result.error, 'not-a-player');
  assert.equal(joined.states, undefined, 'a refused publish must never touch the existing session');
});
