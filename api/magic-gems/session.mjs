// MP2-STORE/MP2-API-FIX: the real REST-backed session service (SPEC 13.2),
// replacing MP2's temporary same-origin stub behind the exact client seam it
// defined. Uses a small, self-contained copy of the pure decision logic
// (./_session-logic.mjs) scoped to this directory - not a cross-boundary
// import into the shipped game's own src/ folder, which crashed in
// production once this function and the static game ended up at different
// relative locations after deployment.
import { getStoredSession, setStoredSession, checkRateLimit } from './_upstash.mjs';
import { generateSessionCode, createSession, joinSession, appendPlayerMoves, CODE_LENGTH } from './_session-logic.mjs';

const CODE_PATTERN = new RegExp(`^[A-Z]{${CODE_LENGTH}}$`);
const MAX_NAME_LENGTH = 20;
// MP4-MOVES/SPEC 13.4 (re-frozen): the only keys that affect board/cursor
// state - matches src/interaction.js's own DIRECTIONS plus the select/swap
// key. ESC/S/A/Y/N are deliberately excluded: they're local-only UI concerns
// (exit confirmation, audio, autoplay), never part of the opponent's replay.
const VALID_MOVE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ']);
// A real player (or autoplay, at its own ~107ms/step pace) can't plausibly
// generate anywhere near this many keys between two publishes on the
// client's own ~500ms timer - generous headroom while still bounding a
// scripted flood (M1-style).
const MAX_MOVES_PER_REQUEST = 50;
// Security review (commit 023dece), M2: no per-caller throttle previously -
// tight enough to blunt a scripted flood against a zero-auth endpoint. must
// stay comfortably above legitimate traffic - security review (commit
// 7b43738) found the original threshold (20) was actually BELOW the
// already-shipped host's own status-polling rate while waiting for a second
// player (session-api-client.js's own POLL_INTERVAL_MS = 1500ms is 40
// requests/60s). Security review (commit be737cd), Finding 3: raising this
// to 150 fixed that, but MP4's own publish traffic during a live match
// (PUBLISH_INTERVAL_MS = 500ms is 120 requests/60s) added on top of the same
// client's own polling brought the combined real rate to 160/60s - back
// above the 150 cap, deterministically, for every match. 320 restores a
// healthy margin (2x) over that real combined rate while still meaningfully
// capping a real flood.
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 320;

function callerIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Security review (commit 023dece), M1: the client's own maxlength attributes
// are UI-only and enforce nothing server-side - every field arriving here is
// untrusted regardless of what the real lobby UI would ever send.
function validNameOrError(name, fieldName) {
  if (typeof name !== 'string' || name.length < 1 || name.length > MAX_NAME_LENGTH) {
    return `${fieldName} must be a string between 1 and ${MAX_NAME_LENGTH} characters`;
  }
  return null;
}

function validCodeOrError(code) {
  if (typeof code !== 'string' || !CODE_PATTERN.test(code)) {
    return `code must be exactly ${CODE_LENGTH} uppercase letters`;
  }
  return null;
}

function validMovesOrError(moves) {
  if (!Array.isArray(moves) || moves.length < 1 || moves.length > MAX_MOVES_PER_REQUEST) {
    return `moves must be an array of 1 to ${MAX_MOVES_PER_REQUEST} moves`;
  }
  for (const move of moves) {
    if (!VALID_MOVE_KEYS.has(move)) {
      return 'each move must be one of the known cursor/select keys';
    }
  }
  return null;
}

async function handleCreate(env, hostName) {
  let code = generateSessionCode();
  while (await getStoredSession(env, code)) code = generateSessionCode();
  const session = createSession(code, hostName);
  await setStoredSession(env, session);
  return session;
}

async function handleJoin(env, code, playerName) {
  const existing = await getStoredSession(env, code);
  const result = joinSession(existing, playerName);
  if (result.ok) await setStoredSession(env, result.session);
  return result;
}

async function handleAppendMoves(env, code, playerName, moves) {
  const existing = await getStoredSession(env, code);
  if (!existing) return { ok: false, error: 'not-found' };
  const result = appendPlayerMoves(existing, playerName, moves);
  if (!result.ok) return result;
  await setStoredSession(env, result.session);
  return result;
}

export default {
  async fetch(request) {
    try {
      const withinLimit = await checkRateLimit(
        process.env,
        callerIp(request),
        RATE_LIMIT_MAX_REQUESTS,
        RATE_LIMIT_WINDOW_SECONDS
      );
      if (!withinLimit) return jsonResponse({ error: 'rate limit exceeded, try again shortly' }, 429);

      if (request.method === 'GET') {
        const code = new URL(request.url).searchParams.get('code');
        if (!code) return jsonResponse({ error: 'missing code' }, 400);
        const codeError = validCodeOrError(code);
        if (codeError) return jsonResponse({ error: codeError }, 400);
        const session = await getStoredSession(process.env, code);
        return jsonResponse({ session });
      }
      if (request.method === 'POST') {
        const body = await request.json();
        if (body.action === 'create') {
          const nameError = validNameOrError(body.hostName, 'hostName');
          if (nameError) return jsonResponse({ error: nameError }, 400);
          const session = await handleCreate(process.env, body.hostName);
          return jsonResponse({ session });
        }
        if (body.action === 'join') {
          const codeError = validCodeOrError(body.code);
          if (codeError) return jsonResponse({ error: codeError }, 400);
          const nameError = validNameOrError(body.playerName, 'playerName');
          if (nameError) return jsonResponse({ error: nameError }, 400);
          const result = await handleJoin(process.env, body.code, body.playerName);
          return jsonResponse(result);
        }
        if (body.action === 'moves') {
          const codeError = validCodeOrError(body.code);
          if (codeError) return jsonResponse({ error: codeError }, 400);
          const nameError = validNameOrError(body.playerName, 'playerName');
          if (nameError) return jsonResponse({ error: nameError }, 400);
          const movesError = validMovesOrError(body.moves);
          if (movesError) return jsonResponse({ error: movesError }, 400);
          const result = await handleAppendMoves(process.env, body.code, body.playerName, body.moves);
          return jsonResponse(result);
        }
        return jsonResponse({ error: 'unknown action' }, 400);
      }
      return jsonResponse({ error: 'method not allowed' }, 405);
    } catch (err) {
      // E3: a misconfigured/unavailable store must surface a clear, HANDLED
      // error to the caller rather than crashing - but security review
      // (commit 023dece), L2: the caller is always anonymous, so the full
      // detail (which can include the store's own internal error text) is
      // logged server-side only; the client gets a generic message. The 400
      // branches above stay as they are - their messages are already
      // client-safe (missing/malformed input, not an internal failure).
      console.error('session function error:', err);
      return jsonResponse({ error: 'internal error' }, 500);
    }
  },
};

// Named export (alongside the default handler) so tests can assert against
// the real threshold directly instead of duplicating the literal - the exact
// drift that let it fall out of sync with real client traffic once already
// (security review, commit 7b43738).
export { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_SECONDS };
