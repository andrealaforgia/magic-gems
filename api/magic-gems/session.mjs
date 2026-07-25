// MP2-STORE/MP2-API-FIX: the real REST-backed session service (SPEC 13.2),
// replacing MP2's temporary same-origin stub behind the exact client seam it
// defined. Uses a small, self-contained copy of the pure decision logic
// (./_session-logic.mjs) scoped to this directory - not a cross-boundary
// import into the shipped game's own src/ folder, which crashed in
// production once this function and the static game ended up at different
// relative locations after deployment.
import { getStoredSession, setStoredSession, checkRateLimit } from './_upstash.mjs';
import { generateSessionCode, createSession, joinSession, publishPlayerState, CODE_LENGTH } from './_session-logic.mjs';

const CODE_PATTERN = new RegExp(`^[A-Z]{${CODE_LENGTH}}$`);
const MAX_NAME_LENGTH = 20;
// MP4/M1: the real board is 8x8 of short gem-type names - capped generously
// rather than exactly matching the game's own constants, so this doesn't
// need to change in lockstep with board-size tuning, while still rejecting
// the oversized-payload class of abuse M1 was about.
const BOARD_SIZE = 8;
const MAX_CELL_LENGTH = 30;
const MAX_SCORE = 1e9;
// Security review (commit 023dece), M2: no per-caller throttle previously -
// tight enough to blunt a scripted flood against a zero-auth endpoint. must
// stay comfortably above legitimate traffic - security review (commit
// 7b43738) found the original threshold (20) was actually BELOW the
// already-shipped host's own status-polling rate while waiting for a second
// player (session-api-client.js's own POLL_INTERVAL_MS = 1500ms is 40
// requests/60s), silently stalling that flow for realistic wait times. 150
// gives that real rate a healthy margin (>3x) while still meaningfully
// capping a real flood.
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 150;

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

function validBoardOrError(board) {
  if (!Array.isArray(board) || board.length !== BOARD_SIZE) {
    return `board must be an array of ${BOARD_SIZE} rows`;
  }
  for (const row of board) {
    if (!Array.isArray(row) || row.length !== BOARD_SIZE) {
      return `each board row must be an array of ${BOARD_SIZE} cells`;
    }
    for (const cell of row) {
      if (typeof cell !== 'string' || cell.length > MAX_CELL_LENGTH) {
        return `each board cell must be a string of at most ${MAX_CELL_LENGTH} characters`;
      }
    }
  }
  return null;
}

function validScoreOrError(score) {
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
    return `score must be a finite number between 0 and ${MAX_SCORE}`;
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

async function handlePublish(env, code, playerName, board, score) {
  const existing = await getStoredSession(env, code);
  if (!existing) return { ok: false, error: 'not-found' };
  const updated = publishPlayerState(existing, playerName, board, score);
  await setStoredSession(env, updated);
  return { ok: true, session: updated };
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
        if (body.action === 'publish') {
          const codeError = validCodeOrError(body.code);
          if (codeError) return jsonResponse({ error: codeError }, 400);
          const nameError = validNameOrError(body.playerName, 'playerName');
          if (nameError) return jsonResponse({ error: nameError }, 400);
          const boardError = validBoardOrError(body.board);
          if (boardError) return jsonResponse({ error: boardError }, 400);
          const scoreError = validScoreOrError(body.score);
          if (scoreError) return jsonResponse({ error: scoreError }, 400);
          const result = await handlePublish(process.env, body.code, body.playerName, body.board, body.score);
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
