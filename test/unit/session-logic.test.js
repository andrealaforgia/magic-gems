import { test } from 'node:test';
import assert from 'node:assert';
import {
  CODE_LENGTH,
  generateSessionCode,
  createSession,
  joinSession,
  recordSnapshot,
  recordSurrender,
  reclaimStaleHeldUpdates,
  MAX_HELD_UPDATES_PER_PLAYER,
  HELD_UPDATE_TIMEOUT_MS,
} from '../../api/magic-gems/_session-logic.mjs';

// QA review (commit 87bd778): this server-side copy had no dedicated test
// file of its own - only exercised indirectly through session-api.test.js's
// handler-level tests, which never verified per-character independence.
// Mirrors test/unit/session.test.js's own coverage of the browser copy.

test('generateSessionCode returns a 10-letter uppercase code (SPEC 13.2.2)', () => {
  const code = generateSessionCode();
  assert.equal(code.length, CODE_LENGTH);
  assert.equal(code.length, 10);
  assert.ok(/^[A-Z]{10}$/.test(code), `expected 10 uppercase letters, got "${code}"`);
});

test('generateSessionCode draws a fresh random value for every one of its 10 characters, not just the first', () => {
  // Pins all 10 draws at once, each to a distinct letter (A..J) - a
  // partially-hardcoded implementation (a real random first character, then
  // a fixed constant for the rest) would diverge from this exact string at
  // position 1 onward and get caught, which a check of position 0 alone
  // could never distinguish from a fully-random implementation. Injects a
  // fake randomIntFn since node:crypto's real randomInt can't be
  // monkey-patched the way src/session.js's own Math.random-based test does.
  let i = 0;
  const fakeRandomInt = () => i++;
  assert.equal(generateSessionCode(fakeRandomInt), 'ABCDEFGHIJ');
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

// MP-RECONNECT/SPEC 13.2.6: a player who left and comes back under their own
// existing name reclaims their place, rather than being turned away as full.
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

// MP-SYNC-SNAPSHOT/SPEC 13.4 (rewritten): each client sends its FULL current
// board and score whenever its own board settles - the opponent draws it
// directly, replacing the earlier move-replay approach entirely. Unlike a
// move log, a snapshot OVERWRITES the player's own prior one: only the
// latest is ever meaningful (13.4.0).
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

// QA review (commit 6cdd179, narrowed per commit f3cb41d's own follow-up
// review): mirrors the same contract the deleted appendPlayerMoves test used
// to carry. Named for exactly what it checks - the caller's own object is
// left alone - not a claim that the stored copy is isolated from it: this
// stores the snapshot by direct reference (never cloned), the same
// carried-forward tradeoff appendPlayerMoves had for its own moves array.
// Real callers only ever reach this through a JSON request/response, which
// already produces an entirely fresh object on the way in, so that aliasing
// never actually reaches this function in practice.
test('recordSnapshot does not mutate the snapshot object the caller passed in', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const board = [['red-square']];
  const snapshot = { board, score: 10, sequence: 0 };

  recordSnapshot(session, 'Alice', snapshot);

  assert.deepEqual(board, [['red-square']]);
  assert.deepEqual(snapshot, { board: [['red-square']], score: 10, sequence: 0 });
});

// Security review (commit be737cd), Finding 1 pattern: a name that isn't
// actually one of the session's own players must be refused, not silently
// accepted as a new broadcaster.
test('recordSnapshot refuses to record a snapshot for a name that isn\'t actually one of the session\'s players', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const { session: joined } = joinSession(session, 'Bob');

  const result = recordSnapshot(joined, 'Mallory', { board: [['red-square']], score: 0, sequence: 0 });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'not-a-player');
  assert.equal(joined.snapshots, undefined, 'a refused snapshot must never touch the existing session');
});

// MP-SEQ-ORDER/SPEC 13.4.1-13.4.4 (slice 2 of 4): the server is serverless and
// gives no guarantee requests arrive in the order they were sent, so ordering
// has to be enforced here rather than assumed. Updates apply in strictly
// ascending sequence order with no gaps, an update arriving ahead of its
// predecessors is held rather than applied, a bounded wait against a real gap
// eventually skips ahead instead of freezing the view, and held state itself
// stays bounded.
function joinedSession() {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  return joinSession(session, 'Bob').session;
}

function snap(sequence, board = [[`board-${sequence}`]], score = sequence) {
  return { board, score, sequence };
}

test('recordSnapshot applies the very first sequence (0) immediately', () => {
  const result = recordSnapshot(joinedSession(), 'Alice', snap(0));

  assert.equal(result.ok, true);
  assert.deepEqual(result.session.snapshots.Alice, snap(0));
});

test('recordSnapshot holds an update that arrives ahead of its predecessor, rather than applying it', () => {
  const afterFirst = recordSnapshot(joinedSession(), 'Alice', snap(0)).session;

  const result = recordSnapshot(afterFirst, 'Alice', snap(2));

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.session.snapshots.Alice,
    snap(0),
    'the applied state must stay at the last in-order update, not jump ahead'
  );
});

test('recordSnapshot applies a held update, and any already-held successor, once its predecessor finally arrives', () => {
  let session = joinedSession();
  session = recordSnapshot(session, 'Alice', snap(0)).session;
  session = recordSnapshot(session, 'Alice', snap(2)).session; // arrives early, held
  session = recordSnapshot(session, 'Alice', snap(3)).session; // arrives early, held

  const result = recordSnapshot(session, 'Alice', snap(1)); // the missing predecessor

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.session.snapshots.Alice,
    snap(3),
    'once 1 arrives, 2 and 3 (already held) must drain in order too, landing on the newest'
  );
});

test('recordSnapshot never regresses the applied state for a stale/duplicate sequence that arrives after a newer one', () => {
  let session = joinedSession();
  session = recordSnapshot(session, 'Alice', snap(0)).session;
  session = recordSnapshot(session, 'Alice', snap(1)).session;

  const result = recordSnapshot(session, 'Alice', snap(0, [['stale-board']], 999));

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.session.snapshots.Alice,
    snap(1),
    'a stale, already-superseded sequence must never overwrite the newer applied state (13.4.3)'
  );
});

test('recordSnapshot ordering for one player never touches the other player\'s own applied state or held buffer', () => {
  let session = joinedSession();
  session = recordSnapshot(session, 'Bob', snap(0)).session;
  session = recordSnapshot(session, 'Alice', snap(0)).session;

  const result = recordSnapshot(session, 'Alice', snap(5)); // held for Alice only

  assert.equal(result.ok, true);
  assert.deepEqual(result.session.snapshots.Bob, snap(0), 'Bob\'s own applied snapshot must be untouched by Alice\'s held update');
});

test('recordSnapshot refuses to hold beyond the bounded per-player cap, rather than accumulating without limit', () => {
  let session = joinedSession();
  session = recordSnapshot(session, 'Alice', snap(0)).session;
  for (let i = 0; i < MAX_HELD_UPDATES_PER_PLAYER; i++) {
    session = recordSnapshot(session, 'Alice', snap(2 + i)).session;
  }

  const result = recordSnapshot(session, 'Alice', snap(2 + MAX_HELD_UPDATES_PER_PLAYER));

  assert.equal(result.ok, false);
  assert.equal(result.error, 'too-many-held-updates');
});

test('reclaimStaleHeldUpdates leaves held updates alone before the bounded wait has elapsed', () => {
  let session = joinedSession();
  session = recordSnapshot(session, 'Alice', snap(0), 1000).session;
  session = recordSnapshot(session, 'Alice', snap(2), 1000).session; // held at t=1000

  const result = reclaimStaleHeldUpdates(session, 1000 + HELD_UPDATE_TIMEOUT_MS - 1);

  assert.deepEqual(result.snapshots.Alice, snap(0), 'still waiting - must not skip ahead early');
});

test('reclaimStaleHeldUpdates skips ahead to the newest held update once the bounded wait elapses, discarding the gap silently', () => {
  let session = joinedSession();
  session = recordSnapshot(session, 'Alice', snap(0), 1000).session;
  session = recordSnapshot(session, 'Alice', snap(3), 1000).session; // held at t=1000, missing 1 and 2
  session = recordSnapshot(session, 'Alice', snap(2), 1000).session; // also held, older than 3

  const result = reclaimStaleHeldUpdates(session, 1000 + HELD_UPDATE_TIMEOUT_MS);

  assert.deepEqual(
    result.snapshots.Alice,
    snap(3),
    'expected a skip-ahead directly to the newest held update (13.4.2), not the oldest held one'
  );
  const nextAfterReclaim = recordSnapshot(result, 'Alice', snap(4));
  assert.deepEqual(
    nextAfterReclaim.session.snapshots.Alice,
    snap(4),
    'the held buffer must be cleared by the reclaim, so a fresh in-order update applies normally afterwards'
  );
});

test('reclaimStaleHeldUpdates is a no-op when nothing is held', () => {
  let session = joinedSession();
  session = recordSnapshot(session, 'Alice', snap(0), 1000).session;

  const result = reclaimStaleHeldUpdates(session, 1000 + HELD_UPDATE_TIMEOUT_MS * 10);

  assert.deepEqual(result.snapshots.Alice, snap(0));
});

test('recordSnapshot itself reclaims a stale held update for the OTHER player before deciding a newly-arriving one', () => {
  let session = joinedSession();
  session = recordSnapshot(session, 'Bob', snap(0), 1000).session;
  session = recordSnapshot(session, 'Bob', snap(2), 1000).session; // held for Bob at t=1000

  // A wholly unrelated call from Alice, long after Bob's bounded wait elapsed.
  const result = recordSnapshot(session, 'Alice', snap(0), 1000 + HELD_UPDATE_TIMEOUT_MS);

  assert.deepEqual(
    result.session.snapshots.Bob,
    snap(2),
    'Bob\'s own stale gap must have been reclaimed as a side effect of any later activity on the same session'
  );
});

// MP5/SPEC 13.5.1: a surrendering player's exit is communicated through the
// session so the opponent's own match can end too, even though they took no
// exit action themselves.
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
