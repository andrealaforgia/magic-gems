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

// SPEC 13.4 (re-frozen)/MP4-MOVES: each client sends its own input actions
// (moves) as they happen; the opponent replays them to reconstruct that
// player's board deterministically, rather than receiving periodic
// board/score snapshots (MP4's own original approach, now superseded).
// Append-only - never replaces a player's own prior moves, and never
// touches the other player's own log.
//
// Security review (commit be737cd), Finding 1 pattern carried over:
// playerName must actually be one of this session's own players - otherwise
// anyone holding the code could inject moves into a slot they were never
// part of.
function appendPlayerMoves(session, playerName, newMoves) {
  if (!session.players.includes(playerName)) return { ok: false, error: 'not-a-player' };
  const existingMoves = (session.moves && session.moves[playerName]) || [];
  return {
    ok: true,
    session: {
      ...session,
      moves: { ...session.moves, [playerName]: [...existingMoves, ...newMoves] },
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

export { CODE_LENGTH, generateSessionCode, createSession, joinSession, appendPlayerMoves, recordSurrender };
