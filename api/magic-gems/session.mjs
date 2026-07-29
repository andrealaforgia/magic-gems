// MP2-STORE/MP2-API-FIX: the real REST-backed session service (SPEC 13.2),
// replacing MP2's temporary same-origin stub behind the exact client seam it
// defined. Uses a small, self-contained copy of the pure decision logic
// (./_session-logic.mjs) scoped to this directory - not a cross-boundary
// import into the shipped game's own src/ folder, which crashed in
// production once this function and the static game ended up at different
// relative locations after deployment.
import { getStoredSession, setStoredSession, updateStoredSession, checkRateLimit } from './_upstash.mjs';
import {
  generateSessionCode,
  createSession,
  joinSession,
  recordSnapshot,
  recordSurrender,
  reclaimStaleHeldUpdates,
  CODE_LENGTH,
} from './_session-logic.mjs';

const CODE_PATTERN = new RegExp(`^[A-Z]{${CODE_LENGTH}}$`);
const MAX_NAME_LENGTH = 20;
// MP-SYNC-SNAPSHOT/SPEC 13.4: the real board is always this exact shape -
// matches src/main.js's own BOARD_SIZE. Duplicated here (not imported)
// rather than reaching outside api/magic-gems/ for it - the same
// self-containment this directory's other copies already follow, for the
// same reason (see _session-logic.mjs's own comment: a cross-boundary import
// risks the exact deploy-topology failure MP2-API-FIX fixed).
const BOARD_SIZE = 8;
// Mirrors src/gems.js's own GEM_TYPES, duplicated here for the same reason
// as BOARD_SIZE above.
const GEM_TYPES = new Set([
  'blue-teardrop',
  'green-octagon',
  'orange-hexagon',
  'purple-triangle',
  'red-square',
  'silver-octagon',
  'yellow-diamond',
]);
// Security: comfortably above anything a real 10-minute match (SPEC 13.5.2)
// could ever legitimately produce, while still rejecting NaN/Infinity/
// negative/garbage values outright.
const MAX_SNAPSHOT_SCORE = 10_000_000;
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

function validBoardOrError(board) {
  const shapeError = `board must be a ${BOARD_SIZE}x${BOARD_SIZE} grid of known gem types`;
  if (!Array.isArray(board) || board.length !== BOARD_SIZE) return shapeError;
  for (const row of board) {
    if (!Array.isArray(row) || row.length !== BOARD_SIZE) return shapeError;
    for (const cell of row) {
      if (!GEM_TYPES.has(cell)) return shapeError;
    }
  }
  return null;
}

function validScoreOrError(score) {
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > MAX_SNAPSHOT_SCORE) {
    return `score must be a number between 0 and ${MAX_SNAPSHOT_SCORE}`;
  }
  return null;
}

// MP-SEQ-WIRE/SPEC 13.4.0 (slice 1 of 4): counts this player's own sent
// updates from the start of their match - a non-negative integer, no upper
// bound needed (unlike score, it's never player-influenced or displayed).
function validSequenceOrError(sequence) {
  if (typeof sequence !== 'number' || !Number.isInteger(sequence) || sequence < 0) {
    return 'sequence must be a non-negative integer';
  }
  return null;
}

// A real board cell reference - row/col integers within the grid.
function validCellOrError(cell, fieldName) {
  if (
    typeof cell !== 'object' ||
    cell === null ||
    !Number.isInteger(cell.row) ||
    !Number.isInteger(cell.col) ||
    cell.row < 0 ||
    cell.row >= BOARD_SIZE ||
    cell.col < 0 ||
    cell.col >= BOARD_SIZE
  ) {
    return `${fieldName} must be a { row, col } within the ${BOARD_SIZE}x${BOARD_SIZE} grid`;
  }
  return null;
}

function validSelectionOrError(selection) {
  if (selection === null) return null;
  return validCellOrError(selection, 'selection');
}

// Security review (commit e9520b5): board is already normalized element-by-
// element against a closed gem-type set rather than trusted as-is - cursor
// and selection are a real cell (already validated by this point), but
// storing/echoing the caller's own object by reference would carry through
// any extra properties riding alongside `row`/`col`. Reconstructing a clean
// { row, col } here closes that the same way board's own validation already
// does.
function normalizeCell(cell) {
  return { row: cell.row, col: cell.col };
}

function normalizeSelection(selection) {
  return selection === null ? null : normalizeCell(selection);
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
  if (result.ok) await updateStoredSession(env, result.session);
  return result;
}

// QA review (commit a89ad37): recordSnapshot stores its snapshot object by
// direct reference, never cloning - safe here specifically because every
// field is always freshly built from this request's own already-JSON-parsed
// body (cursor/selection via normalizeCell/normalizeSelection, board/score/
// sequence already primitives-or-arrays-of-primitives), never a live object
// a caller could go on to mutate. See that test's own rationale
// (test/unit/session-logic.test.js) before changing what gets passed here.
async function handleRecordSnapshot(env, code, playerName, board, score, sequence, cursor, selection) {
  const existing = await getStoredSession(env, code);
  if (!existing) return { ok: false, error: 'not-found' };
  const result = recordSnapshot(
    existing,
    playerName,
    {
      board,
      score,
      sequence,
      cursor: normalizeCell(cursor),
      selection: normalizeSelection(selection),
    },
    Date.now()
  );
  if (!result.ok) return result;
  await updateStoredSession(env, result.session);
  return result;
}

async function handleSurrender(env, code, playerName) {
  const existing = await getStoredSession(env, code);
  if (!existing) return { ok: false, error: 'not-found' };
  const result = recordSurrender(existing, playerName);
  if (!result.ok) return result;
  await updateStoredSession(env, result.session);
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
        if (!session) return jsonResponse({ session });
        // MP-SEQ-ORDER/SPEC 13.4.2: a poll is also a real chance to notice a
        // player's held updates have waited past the bounded timeout - not
        // just a snapshot POST, since the sender may have stopped sending
        // (nothing new to send) while the receiver keeps polling regardless.
        const reclaimed = reclaimStaleHeldUpdates(session, Date.now());
        if (reclaimed !== session) await updateStoredSession(process.env, reclaimed);
        return jsonResponse({ session: reclaimed });
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
        if (body.action === 'snapshot') {
          const codeError = validCodeOrError(body.code);
          if (codeError) return jsonResponse({ error: codeError }, 400);
          const nameError = validNameOrError(body.playerName, 'playerName');
          if (nameError) return jsonResponse({ error: nameError }, 400);
          const boardError = validBoardOrError(body.board);
          if (boardError) return jsonResponse({ error: boardError }, 400);
          const scoreError = validScoreOrError(body.score);
          if (scoreError) return jsonResponse({ error: scoreError }, 400);
          const sequenceError = validSequenceOrError(body.sequence);
          if (sequenceError) return jsonResponse({ error: sequenceError }, 400);
          const cursorError = validCellOrError(body.cursor, 'cursor');
          if (cursorError) return jsonResponse({ error: cursorError }, 400);
          const selectionError = validSelectionOrError(body.selection);
          if (selectionError) return jsonResponse({ error: selectionError }, 400);
          const result = await handleRecordSnapshot(
            process.env,
            body.code,
            body.playerName,
            body.board,
            body.score,
            body.sequence,
            body.cursor,
            body.selection
          );
          return jsonResponse(result);
        }
        if (body.action === 'surrender') {
          const codeError = validCodeOrError(body.code);
          if (codeError) return jsonResponse({ error: codeError }, 400);
          const nameError = validNameOrError(body.playerName, 'playerName');
          if (nameError) return jsonResponse({ error: nameError }, 400);
          const result = await handleSurrender(process.env, body.code, body.playerName);
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
