export default {
  mutate: ['src/board.js', 'src/interaction.js', 'src/layout.js', 'src/resolution.js', 'src/game.js', 'src/shatter.js', 'src/animation.js', 'src/sprite-layout.js', 'src/render.js', 'src/scoring.js', 'src/multiplier-bar.js', 'src/audio-cues.js', 'src/spin.js', 'src/autoplay.js', 'src/session.js', 'src/seeded-random.js', 'api/magic-gems/_upstash.mjs', 'api/magic-gems/session.mjs', 'api/magic-gems/_session-logic.mjs'],
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
//
// (SCORE) src/scoring.js: new file this run (base points, time multiplier, combo
// factor, and the combined completion-score formula). 1 equivalent survivor (the
// same UMD-wrapper case as every file above). One real gap found and fixed: the
// combo-factor argument's multiply survived because every worked-example test used
// comboFactor=1, where multiplying and dividing by it are indistinguishable - added
// a comboFactor=2 case. resolution.js's findMatchedCells/markRun changes (now also
// returns each qualifying run's own length, needed to compute per-run base points
// without conflating a lone 5-run with a 3-run and 4-run that happen to touch)
// brought no new survivors - fully covered by dedicated run-length tests from the
// start, including one that caught a real, pre-existing latent bug in this file's
// own L-shaped-intersection test fixture (its overwrite value coincidentally
// extended one of its two "3-runs" to length 4 via the diagonal base pattern's own
// period-7 wraparound - never surfaced before because no prior test checked run
// length, only that certain cells were marked true).
//
// (DISPLAY-POLISH) src/render.js's new drawCellBackgrounds (the checkerboard cell
// background, SPEC 3.5) and src/multiplier-bar.js (new file - the multiplier's
// fill fraction and green-to-red colour, SPEC 10.8): 1 equivalent survivor each
// (the same UMD-wrapper case as every file above), plus one more in render.js:
// `(row + col) % 2` mutated to `(row - col) % 2` is a true mathematical
// equivalent, not a gap - for any integers, x and -x always share parity, so
// `(row - col) % 2` and `(row + col) % 2` agree on every possible input; no test
// could ever distinguish them. Real gaps found and fixed, not waived: the
// checkerboard's own two StringLiteral colour constants and the even/odd shade
// assignment itself (an === -> !== mutation would silently swap which shade goes
// where, still "alternating", so a same-module-derived comparison can't catch it)
// both survived until a test pinned the literal shipped hex values at specific,
// known-parity cell positions.
//
// (FIX-SELECT) No src/ change was needed - selectUnderCursor already no-opped on a
// redundant SPACE; only new acceptance coverage was added, so mutation testing
// wasn't re-run for it.
//
// (AUDIO) src/audio-cues.js (new file - the cascade-tone clamp, SPEC 11.2.6): 1
// equivalent UMD-wrapper survivor, same as every file above. src/game.js's new
// `reshuffled` field: the `playable !== settled` expression initially survived
// mutation to a hardcoded `false`, a real gap - every existing test only ever
// exercised the false case. Fixed by constructing a fully deterministic 3x3 board
// (small enough to hand-verify every one of its 12 possible adjacent swaps fails to
// match) with a pinned refill (via loadMagicGems's new randomQueue option), proving
// the true case is both reachable and checked. src/audio.js (the actual Audio
// element/playback wiring) is intentionally not in this mutate list - like
// sprites.js and main.js, it's DOM/IO-driven imperative shell verified only by the
// acceptance suite, not unit-testable in the vm sandbox.
//
// (REVIVE) src/resolution.js's ensurePlayable was rewritten from a whole-board
// reshuffle loop to a single/two-cell revive (tryReviveSingleCell,
// tryReviveTwoCells, and an unreachable-in-practice reviveByIncrementalChange
// last resort). Most of the ~30 remaining survivors match patterns already
// established above (OOB-returns-undefined bounds guards; loop bounds that never
// matter because an inner return already exits before the boundary is reached) -
// now appearing on more lines simply because there's more code, not more real
// risk. Two `.map((r) => r.slice())` -> `.map((r) => r)` (no-clone) mutants are
// genuine equivalents too, verified by hand: candidate is only ever mutated
// through a freshly-cloned `attempt` immediately downstream, so the aliasing
// never actually reaches a caller-visible board - confirmed by injecting each
// mutation directly and re-running the full suite. Two real gaps this pass found
// and fixed (QA review, commit 57dd1d6): `tryReviveTwoCells`'s own top-level
// clone WAS reachable (no downstream re-clone protects it), so removing it
// silently mutated the caller's board in place - caught by adding an explicit
// "never mutates its input" test (present for all three revive functions now).
// And `tryReviveTwoCells`'s own accept condition (`if (!hasMatch(...) &&
// hasAnyValidMove(...))` weakened to `if (true)`) survived because
// buildStuckBoard's very first candidate happened to already satisfy the
// postcondition by coincidence - fixed properly, not waived, by adding
// buildStuckBoardRequiringSearch, a second fixture picked so the first
// candidate is genuinely rejected and the search must advance. A different
// survivor remains in reviveByIncrementalChange - not the same class, checked
// directly (QA review, commit bd3a398): `if (gemType === original) continue`
// weakened to `if (false) continue` survives against both fixtures above, since
// it's a no-op-guard mutation the algorithm's own convergence absorbs (trying
// the cell's already-current type again just re-picks the same value, wasting
// one iteration, not corrupting the result) - not a first-candidate-coincidence
// case a new fixture would fix. Closing it for real would need a different
// assertion (every reported changedCells entry actually differs from the
// board's original value at that cell), not a fixture swap. Still not chased
// further - the absolute-last-resort tier beyond even the two-cell pass is
// practically unreachable in real play - but stated accurately now rather than
// conflated with the fix above.
//
// (AUTOPLAY) src/autoplay.js (new file - findValidMove's own cell-to-cursor path
// and the aim direction, SPEC 12.2): 1 equivalent UMD-wrapper survivor. Real
// gaps this run found and fixed, not waived: directionKey originally had
// ArrowUp/ArrowLeft branches that were genuinely unreachable dead code (the
// only caller, findValidMove, always returns its pair in raster order - down or
// right of its first cell, never up or left) - simplified to the two branches
// that matter rather than leaving untestable code around; and pathKeys' own
// vertical/horizontal direction choice was only tested from one direction,
// leaving 15 survivors - fixed with fixtures approaching the same target move
// from below, from the right, and from directly on its own row/column. Two
// `>` -> `>=` survivors on that same ternary are a true equivalent: the chosen
// key is only ever consumed when the two coordinates actually differ (the
// movement loop runs zero times otherwise), and at every point they differ `>`
// and `>=` agree - confirmed by reasoning through every call site, not
// hand-waved. src/resolution.js's own new findValidMove (SPEC 12.2, returns the
// pair hasAnyValidMove only confirmed existed) reuses the exact same search
// shape already hardened for hasAnyValidMove - no new survivors of its own.
//
// (B1, re-tune of SCORE/BONUS-TUNE) src/scoring.js's TIME_MULTIPLIER_START:
// 300 -> 100, re-run scoped to this file alone. 24/25 mutants killed, 1
// equivalent survivor - the same UMD-wrapper case as every file above. No new
// gap: the constant change is exercised by the same worked-example and
// decay-rate tests already hardened when this file was first created (see the
// (SCORE) note above), just re-pointed at the new ceiling and its own new
// multiplier-reaches-0-scores-0 case (SPEC 10.7.2).
//
// (B2, MULTIPLIER-MESSAGE) src/multiplier-bar.js's new multiplierMessage
// (SPEC 10.9): re-run scoped to this file. 18/19 mutants killed, 1 equivalent
// survivor - the same UMD-wrapper case as every file above. No gap: the fixed
// text, the "x"-prefix, and no-padding claims are each pinned by their own
// unit test.
//
// (EXIT-CONFIRM) src/game.js's new handleExitConfirmKey + handleGameKey's ESC
// branch (SPEC 6.6, 14): re-run scoped to this file, 87/88 mutants killed, 1
// equivalent survivor - the same UMD-wrapper case as every file above. Two
// real gaps this pass found and fixed: every branch's `steps: []` was
// untested (no test asserted the resolution-steps field on the exit-overlay
// open/suspend/Y/N returns), and committing an ordinary swap never asserted
// `exitConfirmOpen`/`exitRequested` stayed false - both fixed by adding the
// missing assertions to the existing/new tests, not by waiving anything.
//
// (MP2) src/session.js (new - the stub-backed lobby's pure code-gen/session
// logic, SPEC 13.2): 45/47 killed, 1 timeout, 1 equivalent survivor. The
// survivor is the same UMD-wrapper case as every file above. The timeout is
// generateSessionCode's own `for` loop increment flipped (i++ -> i--), which
// makes the loop condition stay true forever - a genuine infinite loop, not a
// gap: the mutant is definitively caught (the suite can never pass with it),
// just via a hang instead of a failed assertion. No test change needed.
//
// (MP2-STORE) api/magic-gems/_upstash.js + session.js (new - the real
// REST-backed session service, SPEC 13.2, replacing MP2's stub): 80/80
// mutants killed, 100% - the UMD-wrapper case doesn't apply here since these
// are plain Node ESM modules, not browser globals. Real gaps this pass found
// and fixed, not waived: the storage key prefix and TTL constants, the `||`
// vs `&&` in resolveConfig's missing-config check (only tested both-missing,
// not one-of-two-missing), the collision-retry loop (no test forced an actual
// collision - fixed by pinning Math.random to force one directly, not
// narrated), the JSON response content-type, and several exact error-message
// strings on the 400/405 paths.
//
// (MP3) src/seeded-random.js (new) + src/board.js (unchanged logic, re-run
// alongside it): board.js's own survivors are the same wouldMatchAt/hasMatch/
// UMD-wrapper equivalents already documented above (matching patterns, not
// re-derived here), plus 8 timeouts from generateBoard's own do-while loop
// spinning forever when wouldMatchAt is weakened enough to never accept a
// gem - also a genuine, definitively-caught mutant, just via a hang. One real
// gap this pass found and fixed on seeded-random.js: both createSeededRandom
// and hashStringToSeed were only ever tested for GENERAL properties
// (determinism, range, variety) - real, but loose enough that an internally-
// consistent wrong variant (an arithmetic sign flip in mulberry32, an off-by-
// one loop bound in the FNV-1a hash) still satisfied every one of them.
// Fixed by pinning the exact known output for a fixed seed/string, not by
// tightening the property tests further.
//
// (MP2-API-FIX) api/magic-gems/session.mjs + _upstash.mjs (renamed from .js
// to guarantee ESM parsing regardless of the deployed repo's own package.json
// "type" field - a real production crash cause) + the new self-contained
// _session-logic.mjs (replacing a cross-boundary import into src/session.js,
// the OTHER real production crash cause): 109/111 killed, 100% of non-timeout
// mutants, 2 timeouts on _session-logic.mjs's own generateSessionCode - the
// same documented increment-flip infinite loop as src/session.js's own copy.
//
// (Security review round, commit 023dece) input validation (M1), per-IP rate
// limiting (M2), a CSPRNG for session codes (L1), and generic-500-plus-
// server-log error handling (L2): 100% (180/188 killed, 8 timeouts - the same
// documented generateSessionCode infinite-loop pattern, now also present in
// _upstash.mjs's own rate-limit path). Several real gaps this pass found and
// fixed: a malformed/empty rate-limit response threw instead of failing
// closed; the x-forwarded-for parser's own .trim() and the name/code length
// boundaries (exactly empty, exactly at the limit) were untested; and the
// `typeof code !== 'string'` guard survived every non-string test value
// tried (numbers, single non-array values) because their string coercions
// can never match the code pattern anyway - closed with a single-element
// array (`['AAAAAAAAAA']`), whose own default coercion equals its one
// element, genuinely distinguishing the guard from the pattern check alone.
//
// (QA review, commit 87bd778) _session-logic.mjs's own generateSessionCode:
// previously only exercised indirectly (session-api.test.js's handler-level
// tests, which never verified per-character independence). Given its own
// dedicated test file mirroring src/session.js's, including the same
// per-character pin (via an injectable randomIntFn default-parameter seam,
// since node:crypto's real randomInt can't be monkey-patched the way
// Math.random can). 100% (24/24 non-timeout mutants killed), 6 timeouts on
// the same documented increment-flip infinite loop.
//
// (MP4) per-player state publish: _session-logic.mjs's new publishPlayerState
// (100%, 28/28 non-timeout mutants killed) and session.mjs's new validation/
// dispatch for the publish action (99.05%, 203/211 non-timeout mutants
// killed). 2 genuine equivalent survivors on validScoreOrError's leading
// `typeof score !== 'number'` clause (both weakening it to `false` and
// flipping its `||` to `&&`): for every value that isn't of type number,
// Number.isFinite already returns false without coercing (unlike global
// isFinite), so the second clause (`!Number.isFinite(score)`) already
// rejects every one of those values on its own - no input exists where the
// typeof clause's presence or absence changes the outcome. Verified by hand
// across all non-number JS types (string, boolean, null, undefined, array,
// object), not just the ones a test happened to try.
//
// (Security review round, commit be737cd) publish ownership check (Finding
// 1), board-cell GEM_TYPES enum validation (Finding 2, replacing the old
// shape-only check), and the rate-limit headroom fix (Finding 3): 100%
// (_session-logic.mjs, 36/36) / 98.91% (session.mjs, 181/183 non-timeout
// mutants killed) / 98.31% (session.js, 57/58). One real gap this pass found
// and fixed: a mutant that made handlePublish's early-return unconditional
// (`if (true) return result` in place of `if (!result.ok)`) survived because
// the existing publish test only checked the immediate response body, never
// that a successful publish was actually persisted to the store afterward -
// closed with a follow-up GET confirming the state survives past the
// response. Remaining survivors are the same documented equivalents already
// listed above (the leading `typeof score !== 'number'` clause, the
// UMD-wrapper case).
//
// (MP4-MOVES) replaced the board/score snapshot mechanism (publishPlayerState
// / the 'publish' action / validBoardOrError+validScoreOrError) with an
// append-only per-player move-log (appendPlayerMoves / the 'moves' action /
// validMovesOrError, capped at 50 moves per request): 100%
// (_session-logic.mjs 46/46, session.mjs 152/152 non-timeout mutants
// killed), 98.55% (session.js, 1 documented UMD-wrapper equivalent). The
// boundary tests (a batch of exactly 50 accepted, 51 rejected; an unknown
// key like 'Tab' rejected alongside the 5 real ones all accepted) closed
// every mutant on the new size-cap and key-membership checks with no
// survivors.
