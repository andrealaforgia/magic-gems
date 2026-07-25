(function (global) {
  'use strict';

  const { createSession, joinSession, generateSessionCode } = global.MagicGems;

  const STORAGE_PREFIX = 'magic-gems:session:';

  // Security review (commit e9d7a3d): a malformed stored value - reachable
  // only by hand-editing this browser's own localStorage, never from another
  // tab or origin - must read as "no session" rather than throwing and
  // freezing whichever lobby step is waiting on it.
  function parseStoredSession(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function readStoredSession(code) {
    return parseStoredSession(localStorage.getItem(STORAGE_PREFIX + code));
  }

  function writeStoredSession(session) {
    localStorage.setItem(STORAGE_PREFIX + session.code, JSON.stringify(session));
  }

  // MP2: a TEMPORARY stub for SPEC 13.2's eventual REST-backed session service
  // (MP2-STORE swaps the durable store in behind this same seam). Same-origin
  // localStorage plus the native "storage" event stand in for the real
  // server-side store, which is enough for two real browser tabs to run a
  // genuine round trip through it now, without depending on infrastructure
  // that isn't provisioned yet. Every method returns a Promise, matching the
  // real REST client's own shape, so callers need no change when it swaps in.
  function createStubSessionClient() {
    return {
      createSession(hostName) {
        let code = generateSessionCode();
        while (readStoredSession(code)) code = generateSessionCode();
        const session = createSession(code, hostName);
        writeStoredSession(session);
        return Promise.resolve(session);
      },
      joinSession(code, playerName) {
        const result = joinSession(readStoredSession(code), playerName);
        if (result.ok) writeStoredSession(result.session);
        return Promise.resolve(result);
      },
      getSession(code) {
        return Promise.resolve(readStoredSession(code));
      },
      // SPEC 13.2.4: lets the host's own screen "register and acknowledge" the
      // second player's presence without polling - the storage event fires in
      // this tab whenever ANOTHER tab writes the same key, which is exactly
      // the host-detects-the-joiner direction this needs.
      subscribeSession(code, onChange) {
        const key = STORAGE_PREFIX + code;
        function handler(event) {
          if (event.key !== key) return;
          onChange(parseStoredSession(event.newValue));
        }
        global.addEventListener('storage', handler);
        return () => global.removeEventListener('storage', handler);
      },
    };
  }

  global.MagicGems.createStubSessionClient = createStubSessionClient;
})(typeof window !== 'undefined' ? window : globalThis);
