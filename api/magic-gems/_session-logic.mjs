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

const CODE_LENGTH = 10;
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function generateSessionCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
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

export { CODE_LENGTH, generateSessionCode, createSession, joinSession };
