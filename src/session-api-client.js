(function (global) {
  'use strict';

  const API_URL = '/api/magic-gems/session';
  // MP2-STORE: a plain REST API has no push channel back to an idle client,
  // so the host's own screen polls for the second player instead of the
  // stub's native "storage" event - a real request each interval, not a
  // hardcoded readiness flag.
  const POLL_INTERVAL_MS = 1500;
  // MP4/SPEC 13.4: how often each client publishes its own board+score during
  // a match - defined alongside POLL_INTERVAL_MS (not in main.js, where the
  // match loop itself lives) so both of this session service's own traffic
  // rates can be checked together against the server's rate limit the same
  // lightweight way, without needing a live browser.
  const PUBLISH_INTERVAL_MS = 500;

  async function parseOrThrow(res) {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || `session request failed (${res.status})`);
    }
    return body;
  }

  async function postAction(body) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return parseOrThrow(res);
  }

  async function fetchSession(code) {
    const res = await fetch(`${API_URL}?code=${encodeURIComponent(code)}`);
    const body = await parseOrThrow(res);
    return body.session;
  }

  // MP2-STORE: swaps MP2's temporary same-origin/localStorage stub for the
  // real, server-backed session service (SPEC 13.2) behind the exact same
  // seam - createSession/joinSession/getSession/subscribeSession - so the
  // lobby wiring in main.js needs no change beyond which client it creates.
  function createRestSessionClient() {
    return {
      async createSession(hostName) {
        const { session } = await postAction({ action: 'create', hostName });
        return session;
      },
      joinSession(code, playerName) {
        return postAction({ action: 'join', code, playerName });
      },
      getSession(code) {
        return fetchSession(code);
      },
      subscribeSession(code, onChange) {
        let stopped = false;
        const timer = setInterval(async () => {
          if (stopped) return;
          try {
            const session = await fetchSession(code);
            if (session && session.players.length === 2) onChange(session);
          } catch (err) {
            // A single transient poll failure isn't surfaced here - the
            // create/join calls a player is actively waiting on already
            // report a clear error (E4); the next poll just tries again.
          }
        }, POLL_INTERVAL_MS);
        return () => {
          stopped = true;
          clearInterval(timer);
        };
      },
      // MP4/SPEC 13.4: fire-and-forget - a failed publish never surfaces to
      // the caller, so a transient network hiccup can't block or slow down
      // local play (E4). The next publish on the timer just tries again.
      publishState(code, playerName, board, score) {
        return postAction({ action: 'publish', code, playerName, board, score }).catch(() => {});
      },
      // MP4/SPEC 13.4: continuous poll (unlike subscribeSession's one-shot
      // stop-on-2-players) - runs for the whole match so the remote side
      // keeps refreshing. A single transient poll failure isn't surfaced
      // (E4); the next poll just tries again.
      pollMatchState(code, onEachPoll) {
        let stopped = false;
        const timer = setInterval(async () => {
          if (stopped) return;
          try {
            const session = await fetchSession(code);
            if (session) onEachPoll(session);
          } catch (err) {
            // intentionally ignored - see comment above
          }
        }, POLL_INTERVAL_MS);
        return () => {
          stopped = true;
          clearInterval(timer);
        };
      },
    };
  }

  global.MagicGems = global.MagicGems || {};
  global.MagicGems.createRestSessionClient = createRestSessionClient;
  // Test-observability only: lets a test tie this to the server's own rate
  // limit and catch a repeat of the exact drift a security review found once
  // already (commit 7b43738) - this value silently exceeding the server's
  // allowance.
  global.MagicGems.SESSION_POLL_INTERVAL_MS = POLL_INTERVAL_MS;
  global.MagicGems.SESSION_PUBLISH_INTERVAL_MS = PUBLISH_INTERVAL_MS;
})(typeof window !== 'undefined' ? window : globalThis);
