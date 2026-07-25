const KEY_PREFIX = 'magic-gems:session:';
// SPEC 13.2/E3 (MP2-STORE): abandoned sessions expire on their own rather
// than accumulating in the store forever - an hour is ample for one lobby
// pairing to complete without depending on any separate cleanup job.
const SESSION_TTL_SECONDS = 60 * 60;

// MP2-STORE's own infra contract: standard Upstash env var names, tolerating
// Vercel's own KV integration names too; fails clearly (E4) rather than
// silently proceeding with an unusable store.
function resolveConfig(env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      'session store is not configured: set UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL/KV_REST_API_TOKEN)'
    );
  }
  return { url, token };
}

function sessionKey(code) {
  return KEY_PREFIX + code;
}

async function getStoredSession(env, code) {
  const { url, token } = resolveConfig(env);
  const res = await fetch(`${url}/get/${encodeURIComponent(sessionKey(code))}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return body.result ? JSON.parse(body.result) : null;
}

async function setStoredSession(env, session) {
  const { url, token } = resolveConfig(env);
  const key = sessionKey(session.code);
  // Upstash REST: POST with the value as the raw body puts any further
  // command arguments (here, the EX TTL) in the query string instead of the
  // path - documented for JSON/binary values specifically.
  const res = await fetch(`${url}/set/${encodeURIComponent(key)}?EX=${SESSION_TTL_SECONDS}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(session),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error);
}

export { resolveConfig, sessionKey, getStoredSession, setStoredSession, KEY_PREFIX, SESSION_TTL_SECONDS };
