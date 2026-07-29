import { loadMagicGems } from '../../support/load-src.js';

const { generateSessionCode, createSession, joinSession, recordSnapshot, recordSurrender } = loadMagicGems([
  new URL('../../../src/session.js', import.meta.url),
]);

// A realistic in-memory stand-in for the real Upstash-backed API
// (api/magic-gems/session.mjs) - reuses the exact same pure decision logic
// the real handler does, so this proves the client's real request/response
// code path, not a hand-narrated fake. Installed at the CONTEXT level (not
// per-page) so a scenario that opens a second page in the same context (MP2's
// own cross-page round trip) shares this one in-memory store, matching how
// two real clients would share the real server-side store.
export function installSessionApiMock(context) {
  const store = new Map();
  return context.route('**/api/magic-gems/session**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (request.method() === 'GET') {
      const code = url.searchParams.get('code');
      return json({ session: store.has(code) ? store.get(code) : null });
    }
    if (request.method() === 'POST') {
      const body = JSON.parse(request.postData() || '{}');
      if (body.action === 'create') {
        let code = generateSessionCode();
        while (store.has(code)) code = generateSessionCode();
        const session = createSession(code, body.hostName);
        store.set(code, session);
        return json({ session });
      }
      if (body.action === 'join') {
        const result = joinSession(store.get(body.code) || null, body.playerName);
        if (result.ok) store.set(body.code, result.session);
        return json(result);
      }
      if (body.action === 'snapshot') {
        const existing = store.get(body.code) || null;
        if (!existing) return json({ ok: false, error: 'not-found' });
        // MP-SEQ-WIRE/SPEC 13.4.0 (slice 1 of 4): passes sequence/cursor/
        // selection through unmodified, same as the real handler - this mock
        // does no validation of its own (that's covered at the unit level
        // against the real handler), only realistic storage/round-trip.
        const result = recordSnapshot(existing, body.playerName, {
          board: body.board,
          score: body.score,
          sequence: body.sequence,
          cursor: body.cursor,
          selection: body.selection,
        });
        if (result.ok) store.set(body.code, result.session);
        return json(result);
      }
      if (body.action === 'surrender') {
        const existing = store.get(body.code) || null;
        if (!existing) return json({ ok: false, error: 'not-found' });
        const result = recordSurrender(existing, body.playerName);
        if (result.ok) store.set(body.code, result.session);
        return json(result);
      }
    }
    return json({ error: 'unsupported request' }, 400);
  });
}
