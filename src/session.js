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

  // MP-SEQ-ORDER/SPEC 13.4.1-13.4.4 (slice 2 of 4): mirrors
  // api/magic-gems/_session-logic.mjs's own copy (kept in sync by hand, not
  // shared - see that file's own comment). Held updates are keyed by
  // player, bounded per player (13.4.4), and lastAdvanceMs tracks when this
  // player's applied state last moved forward - the clock
  // reclaimStaleHeldUpdates measures the bounded wait against (13.4.2).
  const MAX_HELD_UPDATES_PER_PLAYER = 20;
  const HELD_UPDATE_TIMEOUT_MS = 5000;
  // Security warning (commit de091f3): mirrors api/magic-gems/_session-logic.mjs's
  // own copy - see that file's own comment for the full rationale. Rejects
  // an implausibly-far-ahead sequence outright rather than holding it, so a
  // forged one can never later be adopted via skip-ahead and poison the
  // real player's own subsequent updates. Deliberately wider than the
  // held-count cap above, not equal to it, so the two can guard
  // independently of one another.
  const MAX_SEQUENCE_GAP = 100;
  // Security warning (commit de091f3), reopened: mirrors
  // api/magic-gems/_session-logic.mjs's own copy - see that file's own
  // comment for the full rationale. MAX_SEQUENCE_GAP alone is a ratchet
  // (checked against a value the attacker's own accepted jumps advance);
  // this ceiling is anchored to real elapsed time instead, which nothing
  // accepted can move.
  const MIN_REALISTIC_INTERVAL_MS = 500;
  const SEQUENCE_TIME_CEILING_SAFETY_MARGIN = 50;

  function maxPlausibleSequence(firstSeenAtMs, nowMs) {
    const elapsedMs = Math.max(0, nowMs - firstSeenAtMs);
    return Math.ceil(elapsedMs / MIN_REALISTIC_INTERVAL_MS) + SEQUENCE_TIME_CEILING_SAFETY_MARGIN;
  }

  // Security warning (commit cca26c8), reopened again: mirrors
  // api/magic-gems/_session-logic.mjs's own copy - see that file's own
  // comment for the full rationale. The ceiling above is anchored to the
  // client's own theoretical max send rate, not real play's true (much
  // slower) pace - a sustained attack can still open a deficit larger than
  // the remaining match can recover from. This caps the total lifetime
  // advance ever skipped via recovery, independent of elapsed time.
  const MAX_CUMULATIVE_SKIP_ADVANCE = 30;

  // MP-SEQ-CURSOR (Owner extension): mirrors api/magic-gems/_session-logic.mjs's
  // own copy - see that file's own comment for the full rationale. cursorPath
  // is the one field that ACCUMULATES across applied updates rather than
  // overwriting, so a receiver whose own poll cadence is slower than the
  // sender's publish cadence still eventually sees every real waypoint.
  const MAX_STORED_CURSOR_PATH_LENGTH = 200;

  function accumulateCursorPath(previousCursorPath, incomingCursorPath) {
    return [...(previousCursorPath || []), ...(incomingCursorPath || [])].slice(-MAX_STORED_CURSOR_PATH_LENGTH);
  }

  function drainConsecutiveHeld(applied, held) {
    let current = applied;
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
  // the rest of the match. Once a player's held updates have waited past
  // the bounded timeout for their missing predecessor, skip ahead directly
  // to the NEWEST held update (13.4.3) and clear the held buffer - silent
  // and automatic, no error surfaced (13.4.4/E4).
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
      // MP-SEQ-CURSOR (Owner extension): accumulate cursorPath across every
      // held entry being skipped through, in ascending sequence order - see
      // api/magic-gems/_session-logic.mjs's own comment for the rationale.
      const orderedHeldSequences = heldSequences.map(Number).sort((a, b) => a - b);
      let cursorPath = previousApplied && previousApplied.cursorPath;
      for (const heldSequence of orderedHeldSequences) {
        cursorPath = accumulateCursorPath(cursorPath, pending.held[heldSequence].cursorPath);
      }
      snapshots[playerName] = { ...pending.held[newestSequence], cursorPath };
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

  // MP-SYNC-SNAPSHOT/SPEC 13.4 (rewritten), extended by MP-SEQ-ORDER/SPEC
  // 13.4.1-13.4.4 (slice 2 of 4): whenever a client's own board settles, it
  // sends its FULL current board and score; the opponent draws it directly,
  // with no move-by-move replay. The server is serverless and gives no
  // guarantee requests arrive in the order they were sent (13.4.1), so
  // ordering is enforced here rather than assumed: a sequence arriving out
  // of order is HELD until its predecessors have been applied, applied
  // strictly ascending with no gaps, and a stale/duplicate sequence is
  // discarded rather than regressing the applied state (13.4.3).
  //
  // Security review (commit be737cd), Finding 1 pattern carried over:
  // playerName must actually be one of this session's own players.
  function recordSnapshot(session, playerName, snapshot, nowMs = Date.now()) {
    if (!session.players.includes(playerName)) return { ok: false, error: 'not-a-player' };

    const reclaimed = reclaimStaleHeldUpdates(session, nowMs);
    const appliedBefore = reclaimed.snapshots && reclaimed.snapshots[playerName];
    const pendingBefore = (reclaimed.pendingUpdates && reclaimed.pendingUpdates[playerName]) || { held: {} };
    const nextExpectedSequence = appliedBefore ? appliedBefore.sequence + 1 : 0;
    const firstSeenAtMs = pendingBefore.firstSeenAtMs ?? nowMs;
    const totalSkipAdvance = pendingBefore.totalSkipAdvance || 0;

    if (snapshot.sequence < nextExpectedSequence) {
      return { ok: true, applied: false, session: reclaimed };
    }

    if (snapshot.sequence === nextExpectedSequence) {
      const { applied, held } = drainConsecutiveHeld(snapshot, pendingBefore.held);
      // MP-SEQ-CURSOR (Owner extension): continues the accumulation from
      // whatever was already stored by an earlier call - see
      // api/magic-gems/_session-logic.mjs's own comment for the rationale.
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

    if (snapshot.sequence > maxPlausibleSequence(firstSeenAtMs, nowMs)) {
      return { ok: false, error: 'sequence-implausible-for-elapsed-time' };
    }

    // Security warning (commit cca26c8), final round: gates on the
    // PROJECTED total (what it would become if this candidate is the one
    // later skip-ahead-promoted), not merely the total as it stands before
    // this round - see api/magic-gems/_session-logic.mjs's own comment.
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
  global.MagicGems.recordSnapshot = recordSnapshot;
  global.MagicGems.recordSurrender = recordSurrender;
  global.MagicGems.reclaimStaleHeldUpdates = reclaimStaleHeldUpdates;
  global.MagicGems.MAX_HELD_UPDATES_PER_PLAYER = MAX_HELD_UPDATES_PER_PLAYER;
  global.MagicGems.MAX_SEQUENCE_GAP = MAX_SEQUENCE_GAP;
  global.MagicGems.MIN_REALISTIC_INTERVAL_MS = MIN_REALISTIC_INTERVAL_MS;
  global.MagicGems.SEQUENCE_TIME_CEILING_SAFETY_MARGIN = SEQUENCE_TIME_CEILING_SAFETY_MARGIN;
  global.MagicGems.MAX_CUMULATIVE_SKIP_ADVANCE = MAX_CUMULATIVE_SKIP_ADVANCE;
  global.MagicGems.HELD_UPDATE_TIMEOUT_MS = HELD_UPDATE_TIMEOUT_MS;
  global.MagicGems.MAX_STORED_CURSOR_PATH_LENGTH = MAX_STORED_CURSOR_PATH_LENGTH;
})(typeof window !== 'undefined' ? window : globalThis);
