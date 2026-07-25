(function (global) {
  'use strict';

  // SPEC 13.2.2: a random 10-letter code, shown to the host and typed by the
  // joiner - plain uppercase letters, easy to read aloud and retype by hand.
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

  // SPEC 13.2.3/13.2.4: the second player joins by code; a session already at
  // two is full (no third player), and a code with no matching session at all
  // reports not-found - either way the caller's own (possibly absent) session
  // is returned untouched, never mutated or fabricated.
  function joinSession(session, playerName) {
    if (!session) return { ok: false, error: 'not-found' };
    if (session.players.length >= 2) return { ok: false, error: 'full' };
    return { ok: true, session: { ...session, players: [...session.players, playerName] } };
  }

  // SPEC 13.2.4: "ready" means both players are present - exactly two, no more.
  function isSessionReady(session) {
    return !!session && session.players.length === 2;
  }

  global.MagicGems = global.MagicGems || {};
  global.MagicGems.CODE_LENGTH = CODE_LENGTH;
  global.MagicGems.generateSessionCode = generateSessionCode;
  global.MagicGems.createSession = createSession;
  global.MagicGems.joinSession = joinSession;
  global.MagicGems.isSessionReady = isSessionReady;
})(typeof window !== 'undefined' ? window : globalThis);
