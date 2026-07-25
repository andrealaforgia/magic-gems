(function (global) {
  'use strict';

  const { createSession, joinSession, generateSessionCode } = global.MagicGems;

  const STORAGE_PREFIX = 'magic-gems:session:';

  function readStoredSession(code) {
    const raw = localStorage.getItem(STORAGE_PREFIX + code);
    return raw ? JSON.parse(raw) : null;
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
          onChange(event.newValue ? JSON.parse(event.newValue) : null);
        }
        global.addEventListener('storage', handler);
        return () => global.removeEventListener('storage', handler);
      },
    };
  }

  global.MagicGems.createStubSessionClient = createStubSessionClient;
})(typeof window !== 'undefined' ? window : globalThis);
