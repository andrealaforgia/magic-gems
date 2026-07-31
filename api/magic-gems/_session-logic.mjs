// MP2-API-FIX: the deployed function previously imported the browser-loaded
// src/session.js via a path outside this directory ('../../src/session.js').
// That relative import only resolves if this project's api/ folder and the
// shipped game's own src/ folder end up at exactly matching relative
// locations after deployment - a real deploy-topology assumption that broke
// in production (FUNCTION_INVOCATION_FAILED: a failed module-load crashes
// the whole function before this file's own error handling ever runs). This
// is now a small, self-contained copy scoped to api/magic-gems/ itself, so
// this function's own deployment never depends on where the rest of the
// project's files land. Mirrors src/session.js's logic (kept in sync by
// hand, not shared, precisely to avoid re-introducing that cross-boundary
// dependency).

import { randomInt } from 'node:crypto';

const CODE_LENGTH = 10;
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Security review (commit 023dece), L1: the codespace size (26^10, ~47 bits)
// is what actually makes guessing impractical, not RNG quality - but a real
// CSPRNG is cheap and removes the category of concern outright. Only this
// server-side copy needs it: the browser copy in src/session.js is
// unreachable dead code post-MP2-STORE (session codes are generated here,
// never client-side), kept only for its own existing tests/symmetry.
//
// randomIntFn is injectable (defaulting to the real CSPRNG) so a test can
// pin every one of the 10 draws the same way src/session.js's own test does
// - node:crypto's randomInt can't be monkey-patched from outside like
// Math.random, so this is the seam that makes that possible here too (QA
// review, commit 87bd778).
function generateSessionCode(randomIntFn = randomInt) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomIntFn(CODE_ALPHABET.length)];
  }
  return code;
}

function createSession(code, hostName) {
  return { code, players: [hostName] };
}

// SPEC 13.2.6: a name already in the session is a RECONNECT - reclaiming
// that same place, never rejected as full. "Full" only applies to a
// genuinely third, different name once two distinct players are present.
function joinSession(session, playerName) {
  if (!session) return { ok: false, error: 'not-found' };
  if (session.players.includes(playerName)) return { ok: true, session };
  if (session.players.length >= 2) return { ok: false, error: 'full' };
  return { ok: true, session: { ...session, players: [...session.players, playerName] } };
}

// MP-SYNC-SNAPSHOT/SPEC 13.4 (rewritten): whenever a client's own board
// settles, it sends its FULL current board and score; the opponent draws it
// directly, with no move-by-move replay. This REPLACES the earlier
// move-replay approach (which could desync and then render illegal swaps) -
// a snapshot OVERWRITES the player's own prior one, since only the latest is
// ever meaningful (13.4.0), and never touches the other player's own.
//
// Security review (commit be737cd), Finding 1 pattern carried over:
// playerName must actually be one of this session's own players - otherwise
// anyone holding the code could inject a snapshot into a slot they were
// never part of.
// MP-SEQ-ORDER/SPEC 13.4.1-13.4.4 (slice 2 of 4): held updates, keyed by
// player, bounded per player so a client sending permanently-gapped or
// garbage-high sequence numbers can't grow server-side state without limit
// (13.4.4). lastAdvanceMs tracks when this player's applied state last moved
// forward - the clock reclaimStaleHeldUpdates measures the bounded wait
// against (13.4.2).
const MAX_HELD_UPDATES_PER_PLAYER = 20;
const HELD_UPDATE_TIMEOUT_MS = 5000;

// MP-SEQ-CURSOR (Owner extension, on top of the frozen SPEC 13.4.5.2): every
// other field on a snapshot OVERWRITES on apply (only the latest ever
// matters, 13.4.0) - cursorPath is the one exception, ACCUMULATED instead.
// The receiving client's own poll cadence is deliberately slower than the
// sender's own publish cadence (session-api-client.js's own
// POLL_INTERVAL_MS/PUBLISH_INTERVAL_MS), so if cursorPath just overwrote
// like everything else, an update applied between two of that client's polls
// would have its own cursorPath silently lost the moment a later one
// replaced it - never delivered at all, not even coalesced, because nothing
// ever read it. Accumulating (both across a single drainConsecutiveHeld
// chain and across separate recordSnapshot calls over time) means a slower
// poller still eventually sees every real waypoint. Bounded the same
// defensive way as the wire-level validation cap (session.mjs's own
// MAX_CURSOR_PATH_LENGTH) - trimming the OLDEST entries first is safe
// specifically because the receiving client dedupes by each step's own
// moveSeq, so it only ever needs entries newer than what it already
// incorporated.
const MAX_STORED_CURSOR_PATH_LENGTH = 200;

function accumulateCursorPath(previousCursorPath, incomingCursorPath) {
  return [...(previousCursorPath || []), ...(incomingCursorPath || [])].slice(-MAX_STORED_CURSOR_PATH_LENGTH);
}
// Security warning (commit de091f3), High: without this, a forged request
// carrying an implausible sequence number (e.g. Number.MAX_SAFE_INTEGER) as
// another player would be held like any other out-of-order update, and the
// bounded-wait skip-ahead below - working exactly as designed for a genuine
// gap - would eventually promote it, advancing that player's expected
// sequence far past anything they could ever legitimately reach and
// silently discarding every one of their real subsequent updates. Rejecting
// anything past a small, plausible gap outright (never even holding it)
// closes this without weakening recovery from a real, nearby drop.
// Deliberately wider than the held-count cap above, not equal to it - a gap
// this narrow would only ever admit fewer distinct sequences than the count
// cap allows, making the count cap unreachable and leaving the two unable
// to guard independently of one another.
const MAX_SEQUENCE_GAP = 100;

// Security warning (commit de091f3), reopened: MAX_SEQUENCE_GAP alone is a
// RATCHET, not a bound - it's checked against nextExpectedSequence, a value
// the attacker's OWN accepted jumps advance. Repeating a modest, individually
// plausible forged jump lets the expected sequence walk forward without
// limit over enough rounds, unauthenticated, with the current expected value
// handed to the attacker by the unauthenticated GET. A ceiling anchored to
// REAL ELAPSED TIME since this player's own play began can't be moved by
// anything the attacker gets accepted - it only grows as fast as genuine
// play possibly could, so the cumulative reachable sequence across any
// number of rounds can never outrun real time itself. Matches
// session-api-client.js's own PUBLISH_INTERVAL_MS - no genuine client can
// produce two distinct sequence numbers closer together than this.
const MIN_REALISTIC_INTERVAL_MS = 500;
// A one-time head start, not a per-round allowance - covers a legitimate
// first update arriving fractionally before its own anchor is read back, and
// ordinary clock/processing jitter, without meaningfully widening the
// ceiling's own growth rate over any real span of match time.
const SEQUENCE_TIME_CEILING_SAFETY_MARGIN = 50;

function maxPlausibleSequence(firstSeenAtMs, nowMs) {
  const elapsedMs = Math.max(0, nowMs - firstSeenAtMs);
  return Math.ceil(elapsedMs / MIN_REALISTIC_INTERVAL_MS) + SEQUENCE_TIME_CEILING_SAFETY_MARGIN;
}

// Security warning (commit cca26c8), reopened again: the ceiling above is
// anchored to MIN_REALISTIC_INTERVAL_MS - the client's own publish GATE
// (13.4.0), the fastest a send could EVER fire - not to how fast a real
// board actually settles, which is far slower (a send only fires on an
// actual completed change). A sustained attack, one bounded-wait round at a
// time, opens a growing DEFICIT against the real player's own true pace,
// and past a few minutes into a match the real player's own time to out-
// climb that deficit at their true pace can exceed what's left of the
// match - self-healing in principle, too late to matter in practice. This
// caps the total lifetime advance any player's own missing predecessors may
// EVER be skipped past via recovery - never resetting, independent of
// elapsed time or how many rounds a sustained attempt spans - so the
// worst-case deficit is bounded directly, not merely by how much real time
// has passed. Chosen so full exhaustion still recovers within roughly a
// minute or two even at the slowest plausible real pace, comfortably inside
// the match's own duration (SPEC 13.5.2) regardless of when in the match it
// happens. Blocks only holding a NEW out-of-order candidate once spent - an
// exact, in-order update always keeps applying, budget or not (13.4.8: the
// game itself is never degraded by this).
const MAX_CUMULATIVE_SKIP_ADVANCE = 30;

function drainConsecutiveHeld(applied, held) {
  let current = applied;
  // MP-SEQ-CURSOR (Owner extension): every step drained through here was a
  // real, successfully-sent update - accumulated in true (ascending
  // sequence) order rather than discarded the way board/score/etc from the
  // same in-between updates already are (E1, unchanged).
  let cursorPath = accumulateCursorPath(undefined, applied.cursorPath);
  const remainingHeld = { ...held };
  let nextSequence = applied.sequence + 1;
  while (Object.prototype.hasOwnProperty.call(remainingHeld, nextSequence)) {
    current = remainingHeld[nextSequence];
    cursorPath = accumulateCursorPath(cursorPath, current.cursorPath);
    delete remainingHeld[nextSequence];
    nextSequence++;
  }
  return { applied: { ...current, cursorPath }, held: remainingHeld };
}

// SPEC 13.4.2: a missing update must never freeze the opponent's view for
// the rest of the match. Once a player's held updates have waited past the
// bounded timeout for their missing predecessor, skip ahead directly to the
// NEWEST held update (losing the scenic replay of what's skipped, never the
// correctness of what's shown, 13.4.3) and clear the held buffer - silent
// and automatic, no error surfaced (13.4.4/E4). Run opportunistically
// against every player, not just one - a session touched only by its OTHER
// player (e.g. their own next poll or send) must still reclaim a stale gap.
function reclaimStaleHeldUpdates(session, nowMs) {
  if (!session.pendingUpdates) return session;
  let changed = false;
  const snapshots = { ...session.snapshots };
  const pendingUpdates = { ...session.pendingUpdates };
  for (const playerName of Object.keys(session.pendingUpdates)) {
    const pending = session.pendingUpdates[playerName];
    const heldSequences = Object.keys(pending.held || {});
    if (heldSequences.length === 0) continue;
    if (nowMs - pending.lastAdvanceMs < HELD_UPDATE_TIMEOUT_MS) continue;
    const newestSequence = Math.max(...heldSequences.map(Number));
    const previousApplied = snapshots[playerName];
    const skippedNow = newestSequence - (previousApplied ? previousApplied.sequence + 1 : 0);
    // MP-SEQ-CURSOR (Owner extension): the skip drops board/score/etc from
    // every held update except the newest (E1, unchanged) - but cursorPath
    // is real, additive data from EVERY one of them, cheap to keep, so it's
    // accumulated across the whole held set in true sequence order rather
    // than thrown away along with the rest of what's skipped.
    const orderedHeldSequences = heldSequences.map(Number).sort((a, b) => a - b);
    let cursorPath = previousApplied && previousApplied.cursorPath;
    for (const heldSequence of orderedHeldSequences) {
      cursorPath = accumulateCursorPath(cursorPath, pending.held[heldSequence].cursorPath);
    }
    snapshots[playerName] = { ...pending.held[newestSequence], cursorPath };
    // firstSeenAtMs must never move, even here. Resetting it doesn't reopen
    // the ratchet (a reset-forward anchor only ever makes the ceiling MORE
    // restrictive, never less) - it causes the opposite failure: a
    // legitimate player, well into a real match, would have a later genuine
    // held update wrongly refused as implausible, because the anchor no
    // longer reflects how long their own real play has actually been going.
    // totalSkipAdvance, in contrast, must NEVER reset and only ever grows -
    // it's the lifetime deficit budget MAX_CUMULATIVE_SKIP_ADVANCE bounds.
    pendingUpdates[playerName] = {
      held: {},
      lastAdvanceMs: nowMs,
      firstSeenAtMs: pending.firstSeenAtMs,
      totalSkipAdvance: (pending.totalSkipAdvance || 0) + skippedNow,
    };
    changed = true;
  }
  return changed ? { ...session, snapshots, pendingUpdates } : session;
}

function recordSnapshot(session, playerName, snapshot, nowMs = Date.now()) {
  if (!session.players.includes(playerName)) return { ok: false, error: 'not-a-player' };

  const reclaimed = reclaimStaleHeldUpdates(session, nowMs);
  const appliedBefore = reclaimed.snapshots && reclaimed.snapshots[playerName];
  const pendingBefore = (reclaimed.pendingUpdates && reclaimed.pendingUpdates[playerName]) || { held: {} };
  const nextExpectedSequence = appliedBefore ? appliedBefore.sequence + 1 : 0;
  // Set once, on this player's very first call this match, and never moved
  // again afterward (including through reclaimStaleHeldUpdates's own reset)
  // - the anchor the elapsed-time ceiling below is measured against.
  const firstSeenAtMs = pendingBefore.firstSeenAtMs ?? nowMs;
  const totalSkipAdvance = pendingBefore.totalSkipAdvance || 0;

  // Security warning (commit de091f3), E2: a discarded update must never be
  // indistinguishable from an actually-applied one - `applied` names which
  // of the two happened, whatever `ok` says, so the difference is never
  // silent even though a stale/duplicate arrival is itself expected,
  // harmless traffic rather than an error in its own right.
  if (snapshot.sequence < nextExpectedSequence) {
    return { ok: true, applied: false, session: reclaimed };
  }

  if (snapshot.sequence === nextExpectedSequence) {
    const { applied, held } = drainConsecutiveHeld(snapshot, pendingBefore.held);
    // MP-SEQ-CURSOR (Owner extension): drainConsecutiveHeld already merged
    // this CALL's own chain - this continues that same accumulation from
    // whatever was already stored by an EARLIER call, so the backlog spans
    // every applied update across the match, not just one call's own.
    const withAccumulatedCursorPath = {
      ...applied,
      cursorPath: accumulateCursorPath(appliedBefore && appliedBefore.cursorPath, applied.cursorPath),
    };
    return {
      ok: true,
      applied: true,
      session: {
        ...reclaimed,
        snapshots: { ...reclaimed.snapshots, [playerName]: withAccumulatedCursorPath },
        pendingUpdates: {
          ...reclaimed.pendingUpdates,
          [playerName]: { held, lastAdvanceMs: nowMs, firstSeenAtMs, totalSkipAdvance },
        },
      },
    };
  }

  // Security warning (commit de091f3), reopened: closes the ratchet - a
  // ceiling the attacker's own accepted jumps can never move, unlike the
  // plain gap check below.
  if (snapshot.sequence > maxPlausibleSequence(firstSeenAtMs, nowMs)) {
    return { ok: false, error: 'sequence-implausible-for-elapsed-time' };
  }

  // Security warning (commit cca26c8), final round: gates on the PROJECTED
  // total - what it would become if THIS candidate is the one later
  // skip-ahead-promoted - not merely the total as it stands before this
  // round begins. Gating on the prior total alone let a single round
  // starting from a fresh (zero) budget claim a gap up to just under
  // MAX_SEQUENCE_GAP in one shot, since nothing had been spent yet to
  // compare against - the worst case was bounded only by coincidence (the
  // plain gap check below), not by this budget at all. Projecting first
  // means the worst-case lifetime advance can never exceed
  // MAX_CUMULATIVE_SKIP_ADVANCE, regardless of how it's spent.
  const projectedSkipAdvance = totalSkipAdvance + (snapshot.sequence - nextExpectedSequence);
  if (projectedSkipAdvance > MAX_CUMULATIVE_SKIP_ADVANCE) {
    return { ok: false, error: 'skip-advance-budget-exhausted' };
  }

  if (snapshot.sequence - nextExpectedSequence >= MAX_SEQUENCE_GAP) {
    return { ok: false, error: 'sequence-too-far-ahead' };
  }

  const heldCount = Object.keys(pendingBefore.held).length;
  if (heldCount >= MAX_HELD_UPDATES_PER_PLAYER) {
    return { ok: false, error: 'too-many-held-updates' };
  }
  return {
    ok: true,
    applied: false,
    session: {
      ...reclaimed,
      pendingUpdates: {
        ...reclaimed.pendingUpdates,
        [playerName]: {
          held: { ...pendingBefore.held, [snapshot.sequence]: snapshot },
          lastAdvanceMs: pendingBefore.lastAdvanceMs ?? nowMs,
          firstSeenAtMs,
          totalSkipAdvance,
        },
      },
    },
  };
}

// SPEC 13.5.1/MP5: a surrendering player's exit is communicated through the
// session so the opponent's own match ends too, even though they took no
// exit action themselves. Idempotent - the first surrender stands; a
// second one (e.g. both players exiting near-simultaneously) never
// overwrites it, so both clients agree on a single loser.
function recordSurrender(session, playerName) {
  if (!session.players.includes(playerName)) return { ok: false, error: 'not-a-player' };
  if (session.surrenderedBy) return { ok: true, session };
  return { ok: true, session: { ...session, surrenderedBy: playerName } };
}

export {
  CODE_LENGTH,
  generateSessionCode,
  createSession,
  joinSession,
  recordSnapshot,
  recordSurrender,
  reclaimStaleHeldUpdates,
  MAX_HELD_UPDATES_PER_PLAYER,
  MAX_SEQUENCE_GAP,
  HELD_UPDATE_TIMEOUT_MS,
  MIN_REALISTIC_INTERVAL_MS,
  SEQUENCE_TIME_CEILING_SAFETY_MARGIN,
  MAX_CUMULATIVE_SKIP_ADVANCE,
  MAX_STORED_CURSOR_PATH_LENGTH,
};
