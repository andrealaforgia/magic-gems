import { test } from 'node:test';
import assert from 'node:assert';
import { loadMagicGems } from '../support/load-src.js';

const {
  CODE_LENGTH,
  generateSessionCode,
  createSession,
  joinSession,
  isSessionReady,
  appendPlayerMoves,
  recordSurrender,
  MAX_STORED_MOVES_PER_PLAYER,
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

// MP4-MOVES: mirrors _session-logic.mjs's own coverage of the server-side copy.
test('appendPlayerMoves records a player\'s moves in order under their own name, without touching the other player\'s', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const { session: joined } = joinSession(session, 'Bob');

  const result = appendPlayerMoves(joined, 'Alice', ['ArrowUp', ' ']);

  assert.equal(result.ok, true);
  assert.deepEqual(result.session.moves.Alice, ['ArrowUp', ' ']);
  assert.equal(result.session.moves.Bob, undefined, 'must not fabricate a move log for the other player');
  assert.deepEqual(joined.players, ['Alice', 'Bob'], 'must never mutate the session it was given');
});

test('appendPlayerMoves appends to a previously-recorded move log rather than replacing it, and never touches the other player\'s', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const { session: joined } = joinSession(session, 'Bob');
  const afterBob = appendPlayerMoves(joined, 'Bob', ['ArrowLeft']).session;

  const afterAlice1 = appendPlayerMoves(afterBob, 'Alice', ['ArrowUp']).session;
  const afterAlice2 = appendPlayerMoves(afterAlice1, 'Alice', [' ', 'ArrowRight']).session;

  assert.deepEqual(afterAlice2.moves.Alice, ['ArrowUp', ' ', 'ArrowRight']);
  assert.deepEqual(afterAlice2.moves.Bob, ['ArrowLeft'], 'the other player\'s own move log must survive untouched');
});

test('appendPlayerMoves never mutates the moves array it was given', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const newMoves = ['ArrowUp'];

  appendPlayerMoves(session, 'Alice', newMoves);

  assert.deepEqual(newMoves, ['ArrowUp']);
});

// Security review (commit be737cd), Finding 1 pattern: mirrors
// _session-logic.mjs's own coverage of the same fix on the server-side copy.
test('appendPlayerMoves refuses to record moves for a name that isn\'t actually one of the session\'s players', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const { session: joined } = joinSession(session, 'Bob');

  const result = appendPlayerMoves(joined, 'Mallory', ['ArrowUp']);

  assert.equal(result.ok, false);
  assert.equal(result.error, 'not-a-player');
  assert.equal(joined.moves, undefined, 'a refused append must never touch the existing session');
});

// Security review: mirrors _session-logic.mjs's own coverage of the
// server-side copy's move-log cap.
test('appendPlayerMoves accepts moves right up to the per-player cap', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const { session: joined } = joinSession(session, 'Bob');
  const atCap = { ...joined, moves: { Alice: Array(MAX_STORED_MOVES_PER_PLAYER - 1).fill('ArrowUp') } };

  const result = appendPlayerMoves(atCap, 'Alice', ['ArrowUp']);

  assert.equal(result.ok, true);
  assert.equal(result.session.moves.Alice.length, MAX_STORED_MOVES_PER_PLAYER);
});

test('appendPlayerMoves refuses once a player\'s stored moves would exceed the per-player cap', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const { session: joined } = joinSession(session, 'Bob');
  const atCap = { ...joined, moves: { Alice: Array(MAX_STORED_MOVES_PER_PLAYER).fill('ArrowUp') } };

  const result = appendPlayerMoves(atCap, 'Alice', ['ArrowUp']);

  assert.equal(result.ok, false);
  assert.equal(result.error, 'too-many-moves');
  assert.equal(atCap.moves.Alice.length, MAX_STORED_MOVES_PER_PLAYER, 'a refused append must never touch the existing session');
});

test('appendPlayerMoves refusing one player\'s move cap must never touch the other player\'s own move log', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const { session: joined } = joinSession(session, 'Bob');
  const atCap = {
    ...joined,
    moves: { Alice: Array(MAX_STORED_MOVES_PER_PLAYER).fill('ArrowUp'), Bob: ['ArrowLeft'] },
  };

  const result = appendPlayerMoves(atCap, 'Alice', ['ArrowUp']);

  assert.equal(result.ok, false);
  assert.deepEqual(atCap.moves.Bob, ['ArrowLeft']);
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
