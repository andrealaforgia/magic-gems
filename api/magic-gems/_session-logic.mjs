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

function joinSession(session, playerName) {
  if (!session) return { ok: false, error: 'not-found' };
  if (session.players.length >= 2) return { ok: false, error: 'full' };
  return { ok: true, session: { ...session, players: [...session.players, playerName] } };
}

// SPEC 13.4: each client continuously publishes its own board+score into the
// shared session, keyed by name, so the other client can read it back and
// render it on the remote side - never touching the other player's own
// last-published state.
//
// Security review (commit be737cd), Finding 1: playerName must actually be
// one of this session's own players - otherwise anyone holding the code
// could overwrite the live broadcast of a slot they were never part of.
function publishPlayerState(session, playerName, board, score) {
  if (!session.players.includes(playerName)) return { ok: false, error: 'not-a-player' };
  return {
    ok: true,
    session: {
      ...session,
      states: { ...session.states, [playerName]: { board, score } },
    },
  };
}

export { CODE_LENGTH, generateSessionCode, createSession, joinSession, publishPlayerState };
