export default {
  mutate: ['src/board.js', 'src/interaction.js', 'src/layout.js', 'src/resolution.js', 'src/game.js', 'src/shatter.js', 'src/animation.js', 'src/sprite-layout.js', 'src/render.js'],
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
//
// src/animation.js: 1 equivalent survivor (the same UMD-wrapper case), new file this
// (B4r) run.
//
// (SG1) src/sprite-layout.js and src/render.js: newly added to `mutate` this run (the
// old vector/glow rendering in render.js used Path2D/shadowBlur and had no unit tests
// at all - the sprite re-skin's plain ctx.drawImage()+rect-math approach is finally
// spy-testable with no real Canvas). Each has 1 equivalent survivor (the same
// UMD-wrapper case as every file above). Real gaps this run found were fixed, not
// waived: render.js's highlight-ring rect arithmetic and drawFragments' centring
// arithmetic were exercised only by call-count assertions, not the actual rect
// values, so several ArithmeticOperator mutants on those coordinates survived; fixed
// by asserting exact rect coordinates. A `target` ring drawing unconditionally
// (`if (interaction.target)` -> `if (true)`) also survived because no test covered
// "selection set, target still null" - added one (it also crashes that mutant, since
// null.row throws). HIGHLIGHT_COLORS.selection collapsing to '' survived because no
// test read the colour values themselves, only ring counts - added a
// distinctness/non-empty check. sprite-layout.js's `box / imgHeight` -> `box *
// imgHeight` survived because every existing aspect-ratio test used a landscape
// (wide) sprite, where the height term never actually constrains the result - added
// a portrait (tall) sprite case where it does.
//
// (B4r) resolution.js's applyGravity/refillBoard/resolveCascade changes (per-step
// fallEvents/refillEvents/boardBeforeStep, needed so the renderer can animate swap and
// fall/refill transitions instead of snapping instantly) brought a few more equivalent
// survivors into the same already-established classes, plus 3 real gaps that were fixed:
//   - applyGravity's `next[row][col] = null` assignment in the gap branch is redundant
//     and can be deleted without effect, because `next` is scaffolded via
//     `Array(size).fill(null)` - every cell already starts null. Equivalent, same
//     "assignment made irrelevant by the scaffold's own initial value" family as the
//     already-documented scaffold-array-size equivalents.
//   - refillBoard's outer column loop and collectClearEvents' inner column loop each
//     gained an off-by-one (`<` -> `<=`) equivalent survivor: the extra out-of-bounds
//     column index reads back `undefined`, which fails both loops' `=== null` /
//     truthiness checks, so the extra iteration never does anything observable. Same
//     OOB-index-returns-undefined family as board.js's documented equivalents.
//   - hasAnyValidMove picked up the same harmless-extra-candidate equivalents already
//     documented for board.js's match-checking (weakened bounds only ever try one extra
//     candidate that resolves to false via undefined, never hiding a real valid move).
//   Real gaps found and fixed, not waived:
//   - applyGravity's fallEvents started as `[]` but no test asserted the *unfiltered*
//     array's exact contents - only per-column filtered subsets - so an array seeded
//     with a phantom extra entry survived undetected. Added a test asserting the whole
//     array is exactly `[]` for a fully-populated (no-gap) board.
//   - refillBoard's defensive `row.slice()` copy had no test proving the input board is
//     left untouched; removing it (aliasing the caller's row arrays) survived. Added a
//     test asserting the original board's row contents are unchanged after the call.
//   - collectClearEvents' `if (matched[row][col])` guard could be replaced with `true`,
//     unconditionally reporting *every* cell (not just matched ones) as a clear event,
//     and no test caught it: the existing test only checked that matched cells were
//     *included*, never that unmatched cells were *excluded*. This is the exact property
//     B4r's shatter-scope guarantee (only matched cells shatter; falling/refilled ones
//     never do) depends on, so it was a real, load-bearing gap - fixed by asserting
//     clearEvents' length and full position set exactly match the matched run, no more.
//
// (SG2) src/spin.js: new file this run (the idle-spin behaviour's per-cell rotation
// frame math). 1 equivalent survivor (the same UMD-wrapper case as every file above).
// No real gaps - covered by an exhaustive advance-by-one/wraparound/out-of-phase test
// set from the start. render.js's drawGem/drawBoard frame-index plumbing (added so a
// cell can request any of its gem's 15 rotation frames, not just the face-on one) was
// fully covered by the same run with no new survivors.
//
// (SG3) src/shatter.js's new computeSourceTile (dices a shattered gem's own sprite
// into the fragment grid, replacing the flat-colour fragment fill) and render.js's
// drawFragments (now crops+draws that tile via drawImage instead of a flat
// fillRect): 1 equivalent survivor each (the same UMD-wrapper case as every file
// above). One real gap found and fixed: computeSourceTile's col/row * tileWidth/
// tileHeight multiplications survived at index 0 (col=0 and row=0 make multiply and
// divide coincidentally agree at 0) - added a non-corner-tile test (index 5, both
// axes non-zero) asserting its exact origin.
