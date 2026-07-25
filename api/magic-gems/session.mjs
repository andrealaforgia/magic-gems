// MP2-STORE/MP2-API-FIX: the real REST-backed session service (SPEC 13.2),
// replacing MP2's temporary same-origin stub behind the exact client seam it
// defined. Uses a small, self-contained copy of the pure decision logic
// (./_session-logic.mjs) scoped to this directory - not a cross-boundary
// import into the shipped game's own src/ folder, which crashed in
// production once this function and the static game ended up at different
// relative locations after deployment.
import { getStoredSession, setStoredSession } from './_upstash.mjs';
import { generateSessionCode, createSession, joinSession } from './_session-logic.mjs';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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

export default {
  async fetch(request) {
    try {
      if (request.method === 'GET') {
        const code = new URL(request.url).searchParams.get('code');
        if (!code) return jsonResponse({ error: 'missing code' }, 400);
        const session = await getStoredSession(process.env, code);
        return jsonResponse({ session });
      }
      if (request.method === 'POST') {
        const body = await request.json();
        if (body.action === 'create') {
          const session = await handleCreate(process.env, body.hostName);
          return jsonResponse({ session });
        }
        if (body.action === 'join') {
          const result = await handleJoin(process.env, body.code, body.playerName);
          return jsonResponse(result);
        }
        return jsonResponse({ error: 'unknown action' }, 400);
      }
      return jsonResponse({ error: 'method not allowed' }, 405);
    } catch (err) {
      // E3: a misconfigured/unavailable store must surface a clear error to
      // the caller, never hang or fail invisibly.
      return jsonResponse({ error: err.message }, 500);
    }
  },
};
