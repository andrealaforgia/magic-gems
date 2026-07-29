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
  reclaimStaleHeldUpdates,
  MAX_HELD_UPDATES_PER_PLAYER,
  MAX_SEQUENCE_GAP,
  MIN_REALISTIC_INTERVAL_MS,
  HELD_UPDATE_TIMEOUT_MS,
  MAX_CUMULATIVE_SKIP_ADVANCE,
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

// QA review (commit de091f3): the two-tier strategy's smoke coverage left
// the bounded held-update cap and multi-update chain-drain untested on this
// mirror - a future hand-edit to either could diverge from the server copy
// unnoticed. Closes exactly those two facets, not full 11-test parity (see
// this file's own comment above on why that isn't worth the drift-risk of a
// third copy to maintain).
test('recordSnapshot drains every already-held consecutive successor once the missing predecessor arrives, landing on the newest', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const { session: joined } = joinSession(session, 'Bob');
  let current = recordSnapshot(joined, 'Alice', { board: [['red-square']], score: 0, sequence: 0 }).session;
  current = recordSnapshot(current, 'Alice', { board: [['blue-teardrop']], score: 20, sequence: 2 }).session;
  current = recordSnapshot(current, 'Alice', { board: [['green-octagon']], score: 30, sequence: 3 }).session;

  const result = recordSnapshot(current, 'Alice', { board: [['orange-hexagon']], score: 10, sequence: 1 });

  assert.deepEqual(
    result.session.snapshots.Alice,
    { board: [['green-octagon']], score: 30, sequence: 3 },
    'expected sequences 1, 2 and 3 to drain together once the missing sequence 1 arrived, landing on the newest'
  );
});

test('recordSnapshot refuses to hold beyond the bounded per-player cap, rather than accumulating without limit', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  let current = recordSnapshot(joinSession(session, 'Bob').session, 'Alice', {
    board: [['red-square']],
    score: 0,
    sequence: 0,
  }).session;
  for (let i = 0; i < MAX_HELD_UPDATES_PER_PLAYER; i++) {
    current = recordSnapshot(current, 'Alice', { board: [['blue-teardrop']], score: i, sequence: 2 + i }).session;
  }

  const result = recordSnapshot(current, 'Alice', {
    board: [['green-octagon']],
    score: 99,
    sequence: 2 + MAX_HELD_UPDATES_PER_PLAYER,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'too-many-held-updates');
});

// Security warning (commit de091f3): a light smoke test only - the full
// coverage of this hardening (why the gap exists, the E1 forged-then-genuine
// proof, and every `applied` case) lives in _session-logic.mjs's own test
// file, kept in one place so the two copies can't drift if edited later.
test('recordSnapshot refuses a sequence far outside the plain gap, rather than holding it', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const afterFirst = recordSnapshot(
    joinSession(session, 'Bob').session,
    'Alice',
    { board: [['red-square']], score: 0, sequence: 0 },
    1000
  ).session;
  // A generous simulated elapsed time isolates this from the separate
  // elapsed-time ceiling below, which would otherwise refuse for a
  // different reason first.
  const nowMs = 1000 + 60 * 60 * 1000;

  const result = recordSnapshot(
    afterFirst,
    'Alice',
    { board: [['forged']], score: 999, sequence: 1 + MAX_SEQUENCE_GAP * 10 },
    nowMs
  );

  // MP-SEQ-HARDEN (final round): the cumulative skip-advance budget's own
  // projected-total gate now fires first for a gap this large (30 < 100) -
  // still refused, just via the tighter, actually-reachable check.
  assert.equal(result.ok, false, 'a sequence this far outside the plain gap must still be refused, whichever check catches it');
});

// Security warning (commit de091f3), reopened: the plain gap check above is
// a RATCHET, not a bound, relative to a value the attacker's own accepted
// jumps advance - closes it with a ceiling anchored to real elapsed time
// instead, which nothing accepted can move.
test('recordSnapshot refuses a sequence implausible for how little real time has elapsed, even within the plain gap', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const anchorMs = 1_000_000;
  const afterFirst = recordSnapshot(
    joinSession(session, 'Bob').session,
    'Alice',
    { board: [['red-square']], score: 0, sequence: 0 },
    anchorMs
  ).session;

  const result = recordSnapshot(
    afterFirst,
    'Alice',
    { board: [['forged']], score: 999, sequence: 60 },
    anchorMs + 10
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, 'sequence-implausible-for-elapsed-time');
});

test('recordSnapshot accepts a sequence that is plausible for the real time actually elapsed', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const anchorMs = 1_000_000;
  const afterFirst = recordSnapshot(
    joinSession(session, 'Bob').session,
    'Alice',
    { board: [['red-square']], score: 0, sequence: 0 },
    anchorMs
  ).session;
  const elapsedMs = 10 * MIN_REALISTIC_INTERVAL_MS;
  const plausibleSequence = Math.floor(elapsedMs / MIN_REALISTIC_INTERVAL_MS);

  const result = recordSnapshot(
    afterFirst,
    'Alice',
    { board: [['plausible']], score: 5, sequence: plausibleSequence },
    anchorMs + elapsedMs
  );

  assert.equal(result.ok, true);
  assert.equal(result.applied, false, 'held, pending its own missing predecessors');
});

// QA review (commit cca26c8): reaper flagged the plain gap check's own
// subtraction (- vs +) as untested on this file specifically - the server
// copy's identical check already has this covered, this closes the same gap
// on the mirror. Needs nextExpectedSequence large enough that a sum (rather
// than the correct difference) would wrongly exceed MAX_SEQUENCE_GAP even
// for a genuinely small, legitimately-held gap. Reached via sequential
// exact-match applies (never via skip-ahead recovery), which never touch
// the lifetime skip-advance budget - a skip-ahead big enough to reach 46 in
// one jump would exhaust that budget outright and mask this check entirely.
test('recordSnapshot holds a genuinely small gap correctly once nextExpectedSequence is large - the plain gap is a difference, not a sum', () => {
  const t0 = 1_000_000;
  const session = createSession('ABCDEFGHIJ', 'Alice');
  let current = recordSnapshot(joinSession(session, 'Bob').session, 'Alice', {
    board: [['red-square']],
    score: 0,
    sequence: 0,
  }, t0).session;
  for (let sequence = 1; sequence <= 45; sequence++) {
    current = recordSnapshot(current, 'Alice', { board: [['blue-teardrop']], score: sequence, sequence }, t0 + sequence).session;
  }

  const nowMs = t0 + 5000; // comfortably past the elapsed-time ceiling for sequence 56 too
  const result = recordSnapshot(current, 'Alice', { board: [['ahead']], score: 56, sequence: 56 }, nowMs); // gap of 10

  assert.equal(
    result.ok,
    true,
    'a genuinely small gap (10) must be held, not refused - only a sum (56+46=102) would wrongly exceed MAX_SEQUENCE_GAP here, not the correct difference (10)'
  );
  assert.equal(result.applied, false);
});

// QA review (commit cca26c8), highest priority: nothing on this mirror
// exercised firstSeenAtMs surviving a bounded-wait reclaim - see
// _session-logic.mjs's own test of the same name for the full rationale on
// why a reset anchor causes wrongful refusal of later legitimate play, not a
// reopened ratchet.
//
// MP-SEQ-HARDEN (final round): now that the cumulative skip-advance budget
// gates on the projected total, it dominates any gap large enough to
// distinguish a preserved vs. reset ceiling through accept/reject alone -
// asserts the stored anchor directly instead.
test('a bounded-wait reclaim does not reset the elapsed-time anchor, so it still reflects when the match actually began', () => {
  const t0 = 1_000_000;
  const session = createSession('ABCDEFGHIJ', 'Alice');
  let current = recordSnapshot(joinSession(session, 'Bob').session, 'Alice', {
    board: [['red-square']],
    score: 0,
    sequence: 0,
  }, t0).session;
  current = recordSnapshot(current, 'Alice', { board: [['blue-teardrop']], score: 5, sequence: 5 }, t0 + 1000).session;
  current = reclaimStaleHeldUpdates(current, t0 + 1000 + HELD_UPDATE_TIMEOUT_MS);

  assert.equal(
    current.pendingUpdates.Alice.firstSeenAtMs,
    t0,
    'a reset anchor would collapse the ceiling to the reclaim\'s own recent moment instead of reflecting the whole match so far'
  );
});

// Security warning (commit cca26c8), reopened again: a light smoke test
// only - the full rationale (why the elapsed-time ceiling alone still lets
// a sustained attack open an unrecoverable-in-time deficit, and the proof
// that in-order applies always keep working regardless) lives in
// _session-logic.mjs's own test file.
test('recordSnapshot refuses to hold once the lifetime skip-advance budget is exhausted, even for an otherwise-plausible small gap', () => {
  const t0 = 1_000_000;
  const session = createSession('ABCDEFGHIJ', 'Alice');
  let current = recordSnapshot(joinSession(session, 'Bob').session, 'Alice', {
    board: [['red-square']],
    score: 0,
    sequence: 0,
  }, t0).session;
  let now = t0;

  const totalSkipAdvance = () => (current.pendingUpdates?.Alice?.totalSkipAdvance) || 0;
  while (totalSkipAdvance() < MAX_CUMULATIVE_SKIP_ADVANCE) {
    const nextExpected = current.snapshots.Alice.sequence + 1;
    now += HELD_UPDATE_TIMEOUT_MS + 500;
    const held = recordSnapshot(current, 'Alice', { board: [['forged']], score: 1, sequence: nextExpected + 5 }, now);
    current = reclaimStaleHeldUpdates(held.session, now + HELD_UPDATE_TIMEOUT_MS);
    now += HELD_UPDATE_TIMEOUT_MS;
  }

  const nextExpected = current.snapshots.Alice.sequence + 1;
  now += 1000;
  const result = recordSnapshot(current, 'Alice', { board: [['forged']], score: 999, sequence: nextExpected + 5 }, now);

  assert.equal(result.ok, false);
  assert.equal(result.error, 'skip-advance-budget-exhausted');
});

// MP-SEQ-HARDEN (final round): a light smoke test only - see
// _session-logic.mjs's own test of the same name for the full rationale on
// why gating on the total as it stood before this round, rather than the
// projected total, let a single fresh round claim most of the budget in one
// shot.
test('recordSnapshot refuses a single round whose own gap alone would already exceed the lifetime budget, even starting from zero', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const afterFirst = recordSnapshot(joinSession(session, 'Bob').session, 'Alice', {
    board: [['red-square']],
    score: 0,
    sequence: 0,
  }, 1000).session;

  const result = recordSnapshot(
    afterFirst,
    'Alice',
    { board: [['forged']], score: 999, sequence: 1 + MAX_CUMULATIVE_SKIP_ADVANCE + 20 },
    10000
  );

  assert.equal(
    result.ok,
    false,
    'a single round claiming more than the entire lifetime budget must be refused outright, not merely tolerated because nothing was spent yet'
  );
  assert.equal(result.error, 'skip-advance-budget-exhausted');
});

// Examiner ruling (commit d568262): a light smoke test only - see
// _session-logic.mjs's own test of the same name for the full rationale on
// proving the magnitude at exhaustion, plus a further gap refused while
// genuine in-order sends still apply.
test('the accumulated skip-advance total never overshoots the intended cap, even from a single large round', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  const afterFirst = recordSnapshot(joinSession(session, 'Bob').session, 'Alice', {
    board: [['red-square']],
    score: 0,
    sequence: 0,
  }, 1000).session;
  const now = 1000 + 100000;

  const overshootAttempt = recordSnapshot(
    afterFirst,
    'Alice',
    { board: [['forged']], score: 999, sequence: 1 + MAX_CUMULATIVE_SKIP_ADVANCE * 3 },
    now
  );
  assert.equal(
    overshootAttempt.ok,
    false,
    'a gap this far beyond the cap must be refused outright, never partially accepted with an inflated accumulated total'
  );

  const accepted = recordSnapshot(afterFirst, 'Alice', { board: [['forged']], score: 1, sequence: 1 + MAX_CUMULATIVE_SKIP_ADVANCE }, now);
  assert.equal(accepted.ok, true, 'expected a round claiming exactly the cap to be accepted');
  const current = reclaimStaleHeldUpdates(accepted.session, now + HELD_UPDATE_TIMEOUT_MS);

  assert.equal(
    current.pendingUpdates.Alice.totalSkipAdvance,
    MAX_CUMULATIVE_SKIP_ADVANCE,
    'expected the accumulated total to land exactly at the cap, never beyond it'
  );

  const nextExpected = current.snapshots.Alice.sequence + 1;
  const furtherGap = recordSnapshot(current, 'Alice', { board: [['further-forged']], score: 999, sequence: nextExpected + 1 }, now + 1000);
  assert.equal(furtherGap.ok, false, 'expected any further gap after exhaustion to be refused outright');

  const genuine = recordSnapshot(current, 'Alice', { board: [['genuine']], score: 1, sequence: nextExpected }, now + 2000);
  assert.equal(genuine.ok, true, "expected the real player's own in-order update to keep applying normally even after exhaustion");
  assert.equal(genuine.applied, true);
});

test('recordSnapshot marks a discarded stale update as applied:false, distinguishable from a real apply', () => {
  const session = createSession('ABCDEFGHIJ', 'Alice');
  let current = recordSnapshot(joinSession(session, 'Bob').session, 'Alice', {
    board: [['red-square']],
    score: 0,
    sequence: 0,
  }).session;
  current = recordSnapshot(current, 'Alice', { board: [['blue-teardrop']], score: 10, sequence: 1 }).session;

  const result = recordSnapshot(current, 'Alice', { board: [['stale']], score: 999, sequence: 0 });

  assert.equal(result.ok, true);
  assert.equal(result.applied, false, 'a discarded stale update must not report the same shape as an applied one');
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
