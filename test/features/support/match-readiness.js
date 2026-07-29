// MP-SYNC-SEQUENCED root-cause: the match view becomes visible before that
// client's own match accessors (getMatchScore, getMatchBoard,
// isMatchAutoplayOn, ...) finish registering - both depend on the same
// client's own async gem-sprite load resolving. Waiting on one of those
// accessors directly is the real readiness signal; DOM visibility alone is
// not. Shared here so the three call sites that need it stay in sync.
//
// Longer than the plain visibility wait (3000ms elsewhere) because it also
// covers the sprite load itself, not just the DOM flip.
export const MATCH_READY_TIMEOUT_MS = 5000;

export async function waitForMatchReady(page) {
  await page.waitForFunction(() => typeof window.MagicGems.getMatchScore === 'function', null, {
    timeout: MATCH_READY_TIMEOUT_MS,
  });
}
