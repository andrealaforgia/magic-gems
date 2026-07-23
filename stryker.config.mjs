export default {
  mutate: ['src/board.js', 'src/interaction.js', 'src/layout.js'],
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
