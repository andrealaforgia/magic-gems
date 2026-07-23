export default {
  mutate: ['src/board.js', 'src/interaction.js', 'src/layout.js', 'src/resolution.js', 'src/game.js', 'src/shatter.js'],
  testRunner: 'command',
  commandRunner: { command: 'npm run test:unit' },
  reporters: ['clear-text', 'progress'],
  coverageAnalysis: 'off',
};

// 11 survivors on src/board.js's wouldMatchAt/hasMatch/UMD-wrapper are provably
// equivalent mutants: JS's permissive out-of-bounds-returns-undefined semantics makes
// the dropped bounds guards redundant, the weakened match checks only ever make
// candidate-rejection *more* conservative (never let a real match slip through, and
// never forbid more than a small constant subset of the 6 gem types so the retry loop
// still terminates), and globalThis === window in both real browsers and this
// project's own runtime usage. None are observable via any behavioural test.
//
// src/interaction.js: 1 equivalent survivor (the same globalThis === window UMD-wrapper
// case as above). Two real gaps this run found were fixed, not waived: ArrowUp/ArrowLeft
// cursor movement and the bottom/right edge boundary were untested (only ArrowRight/Down
// and the top-left corner were covered) — added tests/unit/interaction.test.js cases for
// both. Separately, `key === 'Escape'` mutated to `true` survived because the existing
// "unrecognized key" test only exercised the no-selection state, where cancelSelection's
// own no-op guard coincidentally produces the same result either way — added a case with
// an active selection, where only literal Escape may clear it, to distinguish them.
//
// Also found via this pass: `key === 'Space'` was dead code — real browsers (verified
// with Playwright) report the space bar as KeyboardEvent.key === ' ', never the string
// "Space", so that branch could never fire. Removed it and fixed the unit tests, which
// had been asserting against the fictional 'Space' string instead of the real key value.
//
// Root-caused (was previously misdiagnosed as command-runner non-determinism): an
// earlier note here claimed src/board.js's vertical-match-scan-disabling mutants
// occasionally surfaced as "survived" across separate stryker runs. Inspecting
// @stryker-mutator/core's CommandTestRunner shows mutant switching happens entirely
// via a __STRYKER_ACTIVE_MUTANT__ env var read by the already-instrumented file at
// runtime, not by rewriting files between runs — so a real race there was unlikely.
// Confirmed by reproducing the exact env-var + instrumented-file mechanism directly
// (bypassing Stryker's own scheduling) 20/20 times, and by running the full `stryker
// run` three times back-to-back with zero code changes: identical 93.30% score, same
// 11/1/1 survivor breakdown, every time. The apparent flakiness was a measurement
// artifact — earlier comparisons were made across different `mutate` config states and
// test-file edits made while actively iterating, not the same experiment repeated.
//
// src/layout.js: 1 equivalent survivor (the same globalThis === window UMD-wrapper case).
//
// src/game.js: 1 equivalent survivor (the same UMD-wrapper case). Three real gaps this
// run found were fixed: any key (not just SPACE) committed a swap once a selection and
// target both existed; fixed by adding a test where an arrow key, with both already
// set, re-aims the target instead of committing.
//
// src/resolution.js: 12 equivalent survivors, all matching established patterns above
// (OOB-index-returns-undefined making dropped bounds guards redundant; a scaffold
// array immediately, fully overwritten cell-by-cell making its initial size
// irrelevant; and two loop safety nets - the cascade's iteration cap and
// ensurePlayable's do-while - whose only role is bounding a pathological case that
// exits via an inner return long before the cap matters, and which can't be
// deliberately triggered without either mocking randomness against this codebase's
// established style or risking a real hang). Several real gaps this run found were
// fixed, not waived:
//   - findMatchedCells missed runs that end exactly at the last column/row, AND (a
//     second, distinct bug) runs that start exactly at the first column/row - the
//     latter from a run-tracker initialized with a placeholder object mutants could
//     turn into `{}` without changing behaviour, revealing the initial position
//     wasn't actually load-bearing in any existing test. Added boundary-run tests for
//     both ends of both axes.
//   - applyGravity's output shape (exactly SIZE rows x SIZE columns) was never
//     asserted, so an off-by-one that silently grew a row was invisible. Added a
//     structural shape test.
//   - hasAnyValidMove missed the board's rightmost column pair and had no test that
//     could only be satisfied via a vertical swap (the one existing "true" case
//     happened to be found by the horizontal check alone). Building clean fixtures
//     for these took real care: constructing them as buildMatchFreeBoard() + a few
//     overrides kept producing *extra*, unintended valid moves elsewhere on the board
//     (the diagonal pattern's period-6 repetition colliding with the overrides) that
//     a broken check could still stumble onto, silently masking the regression these
//     tests exist to catch. Both fixtures below were found by local search and
//     confirmed, by exhaustively enumerating every adjacent swap, to contain exactly
//     one valid move each.
// (B4) resolveCascade's clearEvents addition brought one more equivalent survivor into
// this same safety-net class: the final `return {}` fallback is only reachable past
// CASCADE_SAFETY_LIMIT iterations, the same pathological case the existing cap/do-while
// equivalents already cover.
//
// src/shatter.js: 1 equivalent survivor (the same UMD-wrapper case). One real gap this
// run found: a GRAVITY_ACCEL * dt -> / dt mutation survived because the position
// assertion recomputed its expected value *from the function's own returned vy*, making
// it consistent with whatever vy the mutant produced rather than independently checking
// gravity's arithmetic. Fixed by comparing gravity's contribution at two different
// elapsed times instead (doubling dt must double the contribution; dividing would halve
// it) - this catches multiply-vs-divide without needing to know GRAVITY_ACCEL's value.
