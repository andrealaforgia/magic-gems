const KEY_PREFIX = 'magic-gems:session:';
const RATE_LIMIT_KEY_PREFIX = 'magic-gems:ratelimit:';
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

// Security review (commit 023dece), M2: no per-caller throttle previously -
// every create/join/lookup cost a real store operation with no cap, an
// unauthenticated cost/quota-exhaustion vector. A fixed-window counter (INCR
// + EXPIRE ... NX, so only the FIRST request in a window starts its clock -
// a plain INCR-then-EXPIRE-every-time would keep pushing the window out
// forever under sustained traffic and never actually reset) via Upstash's own
// pipeline endpoint - no new runtime dependency needed for this.
async function updateStoredSession(env, session) {
  const { url, token } = resolveConfig(env);
  const key = sessionKey(session.code);
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([['SET', key, JSON.stringify(session), 'KEEPTTL']]),
  });
  const results = await res.json();
  if (results[0]?.error) throw new Error(results[0].error);
}

async function incrementRateLimitCount(env, bucketId, windowSeconds) {
  const { url, token } = resolveConfig(env);
  const key = RATE_LIMIT_KEY_PREFIX + bucketId;
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, windowSeconds, 'NX'],
    ]),
  });
  const results = await res.json();
  if (results[0]?.error) throw new Error(results[0].error);
  // A malformed/empty pipeline response yields undefined here, which makes
  // checkRateLimit's own `count <= limit` comparison false - failing closed
  // (treated as exceeded) rather than throwing on something this malformed.
  return results[0]?.result;
}

async function checkRateLimit(env, bucketId, limit, windowSeconds) {
  const count = await incrementRateLimitCount(env, bucketId, windowSeconds);
  return count <= limit;
}

export {
  resolveConfig,
  sessionKey,
  getStoredSession,
  setStoredSession,
  updateStoredSession,
  checkRateLimit,
  KEY_PREFIX,
  SESSION_TTL_SECONDS,
  RATE_LIMIT_KEY_PREFIX,
};
