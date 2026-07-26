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
  //
  // SPEC 13.2.6: a name already in the session is a RECONNECT - reclaiming
  // that same place, never rejected as full. "Full" only applies to a
  // genuinely third, different name once two distinct players are present.
  function joinSession(session, playerName) {
    if (!session) return { ok: false, error: 'not-found' };
    if (session.players.includes(playerName)) return { ok: true, session };
    if (session.players.length >= 2) return { ok: false, error: 'full' };
    return { ok: true, session: { ...session, players: [...session.players, playerName] } };
  }

  // SPEC 13.2.4: "ready" means both players are present - exactly two, no more.
  function isSessionReady(session) {
    return !!session && session.players.length === 2;
  }

  // SPEC 13.4 (re-frozen)/MP4-MOVES: each client sends its own input actions
  // (moves) as they happen; the opponent replays them to reconstruct that
  // player's board deterministically, superseding MP4's own original
  // board/score snapshot approach. Mirrors api/magic-gems/_session-logic.mjs's
  // own copy (kept in sync by hand, not shared - see that file's own
  // comment). Append-only - never replaces a player's own prior moves, and
  // never touches the other player's own log.
  //
  // Security review (commit be737cd), Finding 1 pattern carried over:
  // playerName must actually be one of this session's own players.
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

  // SPEC 13.5.1/MP5: a surrendering player's exit is communicated through
  // the session so the opponent's own match ends too. Mirrors
  // api/magic-gems/_session-logic.mjs's own copy. Idempotent - the first
  // surrender stands, so both clients agree on a single loser even if both
  // happen to exit near-simultaneously.
  function recordSurrender(session, playerName) {
    if (!session.players.includes(playerName)) return { ok: false, error: 'not-a-player' };
    if (session.surrenderedBy) return { ok: true, session };
    return { ok: true, session: { ...session, surrenderedBy: playerName } };
  }

  global.MagicGems = global.MagicGems || {};
  global.MagicGems.CODE_LENGTH = CODE_LENGTH;
  global.MagicGems.generateSessionCode = generateSessionCode;
  global.MagicGems.createSession = createSession;
  global.MagicGems.joinSession = joinSession;
  global.MagicGems.isSessionReady = isSessionReady;
  global.MagicGems.appendPlayerMoves = appendPlayerMoves;
  global.MagicGems.recordSurrender = recordSurrender;
})(typeof window !== 'undefined' ? window : globalThis);
