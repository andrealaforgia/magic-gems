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

function drainConsecutiveHeld(applied, held) {
  let current = applied;
  const remainingHeld = { ...held };
  let nextSequence = applied.sequence + 1;
  while (Object.prototype.hasOwnProperty.call(remainingHeld, nextSequence)) {
    current = remainingHeld[nextSequence];
    delete remainingHeld[nextSequence];
    nextSequence++;
  }
  return { applied: current, held: remainingHeld };
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
    snapshots[playerName] = pending.held[newestSequence];
    pendingUpdates[playerName] = { held: {}, lastAdvanceMs: nowMs };
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

  if (snapshot.sequence < nextExpectedSequence) {
    return { ok: true, session: reclaimed };
  }

  if (snapshot.sequence === nextExpectedSequence) {
    const { applied, held } = drainConsecutiveHeld(snapshot, pendingBefore.held);
    return {
      ok: true,
      session: {
        ...reclaimed,
        snapshots: { ...reclaimed.snapshots, [playerName]: applied },
        pendingUpdates: { ...reclaimed.pendingUpdates, [playerName]: { held, lastAdvanceMs: nowMs } },
      },
    };
  }

  const heldCount = Object.keys(pendingBefore.held).length;
  if (heldCount >= MAX_HELD_UPDATES_PER_PLAYER) {
    return { ok: false, error: 'too-many-held-updates' };
  }
  return {
    ok: true,
    session: {
      ...reclaimed,
      pendingUpdates: {
        ...reclaimed.pendingUpdates,
        [playerName]: {
          held: { ...pendingBefore.held, [snapshot.sequence]: snapshot },
          lastAdvanceMs: pendingBefore.lastAdvanceMs ?? nowMs,
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
  HELD_UPDATE_TIMEOUT_MS,
};
