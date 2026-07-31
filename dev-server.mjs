// Local run harness: serves the static game and its session API on one origin
// so multiplayer can be played end-to-end on a development machine.
//
// Production runs the game as static files on Vercel with api/magic-gems/session
// as a serverless function backed by Upstash Redis. Neither half is reachable
// without a deploy, which left the live site as the only place the game could
// be watched. This wires the same handler up behind an in-memory store that
// speaks the subset of the Upstash REST protocol _upstash.mjs actually uses, so
// no external service and no deploy is needed to see a match.
//
// Development only - never part of a deployment.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize, join } from 'node:path';

const PORT = Number(process.env.PORT || 3000);
const HOST = '127.0.0.1';
const ROOT = new URL('.', import.meta.url).pathname;
const UPSTASH_PREFIX = '/__upstash';

// The handler resolves its store config from process.env on every call, so
// pointing it back at this same server has to happen before it is imported.
process.env.UPSTASH_REDIS_REST_URL = `http://${HOST}:${PORT}${UPSTASH_PREFIX}`;
process.env.UPSTASH_REDIS_REST_TOKEN = 'local-dev';

const { default: sessionHandler } = await import('./api/magic-gems/session.mjs');

// Static files are read from disk per request, so a browser reload always gets
// the current client code - but this handler is imported ONCE, here. After any
// edit under api/ the server would keep serving the API from startup while
// serving fresh client code, a split that is invisible from the browser and
// silently misattributes the result. That is not hypothetical: it produced a
// new client talking to a stale API during a live review, and the reviewer had
// no way to know.
//
// ESM has no reliable way to evict a module and its transitive imports from the
// loader cache, so the honest fix is to replace the process rather than pretend
// the handler can be reloaded in place.
{
  const { spawn } = await import('node:child_process');
  const { watch } = await import('node:fs');
  let restarting = false;
  watch(new URL('./api/magic-gems/', import.meta.url), { recursive: true }, (_event, file) => {
    if (restarting || !String(file).endsWith('.mjs')) return;
    restarting = true;
    console.log(`\n  ${file} changed - restarting so the API is not served stale.\n`);
    spawn(process.execPath, [new URL(import.meta.url).pathname], {
      stdio: 'inherit',
      detached: true,
    }).unref();
    process.exit(0);
  });
}

// ---------------------------------------------------------------------------
// In-memory stand-in for Upstash Redis, covering only the commands
// _upstash.mjs issues: GET, SET (with EX and KEEPTTL), INCR and EXPIRE ... NX.
// ---------------------------------------------------------------------------
const store = new Map();

function live(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry;
}

function setKey(key, value, { ttlSeconds = null, keepTtl = false } = {}) {
  const existing = live(key);
  const expiresAt = keepTtl
    ? (existing ? existing.expiresAt : null)
    : ttlSeconds === null
      ? null
      : Date.now() + ttlSeconds * 1000;
  store.set(key, { value, expiresAt });
}

function runCommand([name, ...args]) {
  switch (String(name).toUpperCase()) {
    case 'SET': {
      const [key, value, ...flags] = args;
      setKey(key, String(value), { keepTtl: flags.some((f) => String(f).toUpperCase() === 'KEEPTTL') });
      return { result: 'OK' };
    }
    case 'GET': {
      const entry = live(args[0]);
      return { result: entry ? entry.value : null };
    }
    case 'INCR': {
      const [key] = args;
      const entry = live(key);
      const next = (entry ? Number(entry.value) || 0 : 0) + 1;
      // INCR preserves any TTL already on the key.
      store.set(key, { value: String(next), expiresAt: entry ? entry.expiresAt : null });
      return { result: next };
    }
    case 'EXPIRE': {
      const [key, seconds, ...flags] = args;
      const entry = live(key);
      if (!entry) return { result: 0 };
      // NX: only set a TTL where none exists. Without it the window would be
      // pushed forward on every request and never actually reset.
      if (flags.some((f) => String(f).toUpperCase() === 'NX') && entry.expiresAt !== null) {
        return { result: 0 };
      }
      entry.expiresAt = Date.now() + Number(seconds) * 1000;
      return { result: 1 };
    }
    default:
      return { error: `unsupported command: ${name}` };
  }
}

// Security review of this file, seq 1329 (one Medium, two Lows) - all three
// share one root cause: this prefix was an open read/write data plane over the
// same keys the real handler uses, bypassing that handler's ownership checks
// and reachable by anything that could name the URL.
//
// The Medium was demonstrated, not theorised: dispatch keyed on the path alone,
// so a bodiless GET to /__upstash/set/<key> - trivially triggered cross-origin
// by any page open in another tab, since the side effect lands even when the
// response cannot be read - wrote an empty string over a live session key and
// destroyed the match.
//
// Nothing but the real handler is ever a legitimate caller here, and it always
// presents the bearer token. Requiring it closes the cross-origin route by
// construction: a browser cannot attach an Authorization header cross-origin
// without a preflight, and this server answers no preflight. Method and Origin
// checks are kept as well - defence that does not depend on the token staying
// secret, since this one is a hardcoded development constant.
function storeRequestError(req, method) {
  if (req.method !== method) return `store route requires ${method}`;
  // No browser is ever a legitimate caller; a request carrying Origin is by
  // definition page-driven rather than the handler.
  if (req.headers.origin) return 'store route is not browser-reachable';
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`) return 'store route requires the store token';
  return null;
}

async function handleUpstash(req, res, url, body) {
  const path = url.pathname.slice(UPSTASH_PREFIX.length);

  if (path === '/pipeline') {
    const denied = storeRequestError(req, 'POST');
    if (denied) return json(res, 403, { error: denied });
    const commands = JSON.parse(body || '[]');
    return json(res, 200, commands.map(runCommand));
  }

  const [, op, rawKey] = path.split('/');
  const key = decodeURIComponent(rawKey || '');

  if (op === 'get') {
    const denied = storeRequestError(req, 'GET');
    if (denied) return json(res, 403, { error: denied });
    return json(res, 200, runCommand(['GET', key]));
  }

  if (op === 'set') {
    const denied = storeRequestError(req, 'POST');
    if (denied) return json(res, 403, { error: denied });
    const ex = url.searchParams.get('EX');
    setKey(key, body, { ttlSeconds: ex === null ? null : Number(ex) });
    return json(res, 200, { result: 'OK' });
  }

  return json(res, 400, { error: `unsupported store path: ${path}` });
}

// ---------------------------------------------------------------------------
// Static files and the session API
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function json(res, status, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(text);
}

async function serveStatic(res, pathname) {
  // normalize() collapses any ../ before it is joined, so a crafted path
  // cannot escape the project directory.
  const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, rel);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
}

// Second Low from the same review: chunks were accumulated without any cap
// before JSON.parse, so a single long-running request could grow memory
// unbounded. A board snapshot is a few kilobytes; a megabyte is generous.
const MAX_BODY_BYTES = 1024 * 1024;

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      req.destroy();
      throw new Error('request body too large');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  try {
    if (url.pathname.startsWith(UPSTASH_PREFIX)) {
      return await handleUpstash(req, res, url, await readBody(req));
    }

    if (url.pathname === '/api/magic-gems/session') {
      const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
      // Each browser window needs its own rate-limit bucket, otherwise two
      // players on one machine share a single allowance and the second one
      // gets throttled out of a match that is behaving perfectly well.
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === 'string') headers.set(k, v);
      }
      headers.set('x-forwarded-for', `127.0.0.${(req.socket.remotePort % 250) + 1}`);

      const response = await sessionHandler.fetch(
        new Request(url.href, { method: req.method, headers, body })
      );
      res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'application/json' });
      return res.end(await response.text());
    }

    return await serveStatic(res, url.pathname);
  } catch (err) {
    console.error(`${req.method} ${url.pathname} failed:`, err);
    return json(res, 500, { error: String(err && err.message ? err.message : err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Magic Gems running at http://${HOST}:${PORT}\n`);
  console.log('  To watch a remote player\'s moves as a local player:');
  console.log(`    1. open http://${HOST}:${PORT} in one window  -> Multiplayer -> create a match`);
  console.log(`    2. open http://${HOST}:${PORT} in a second window (or another browser)`);
  console.log('    3. join with the code from the first window\n');
  console.log('  Session state is in memory only and is lost when this server stops.\n');
});
