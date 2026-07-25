# Magic Gems — Frozen Specification

A Bejeweled-style match-3 game, keyboard-controlled, running in the browser.
This document is the single normative reference. Behaviours cite it by section.

## 1. Platform & delivery
- 1.1 Runs in a modern browser with no build step: plain HTML, CSS, and JavaScript.
- 1.2 Rendering uses an HTML5 `<canvas>`.
- 1.3 Ships as a single self-contained folder (no external runtime dependencies),
  deployable by copying it to `andrealaforgia.com/static/magic-gems` and served at
  the path `/magic-gems`.

## 2. The gems
Seven distinct gem types, each rendered from a pre-rendered sprite image — a
glossy, faceted 3D gemstone. The seven identities are:
- 2.1 Blue teardrop.
- 2.2 Green octagon.
- 2.3 Orange hexagon.
- 2.4 Purple triangle.
- 2.5 Red square.
- 2.6 Silver octagon.
- 2.7 Yellow diamond.
- 2.8 A gem's identity is the sprite it depicts (its shape + colour); these seven
  are the only gem types. The sprite art ships with the game as image assets in
  the game folder, one asset set per identity.

## 3. The board & layout
- 3.1 The playfield is an 8×8 grid of gems.
- 3.2 The board occupies the central part of the screen.
- 3.3 Each gem is drawn centred within its grid cell, both horizontally and
  vertically.
- 3.4 The board is sized to occupy about 80% of the viewport's vertical size
  (height), centred; the gems scale up with the board. It must still fit within
  the viewport (not overflow horizontally on narrow screens).
- 3.5 Each grid cell has a solid background, and adjacent cells alternate between
  two shades of dark grey in a checkerboard pattern (like a chessboard) — one
  darker, one slightly less dark. Gems are drawn on top of these cell backgrounds.

## 4. Initial state
- 4.1 The board starts filled with randomly chosen gem types.
- 4.2 The initial fill contains no pre-existing match (no run of 3+ identical gem
  types horizontally or vertically).

## 5. Matches
- 5.1 A match is a straight run of 3 or more identical gem types, horizontal or
  vertical.
- 5.2 Matched gems are removed from the board.

## 6. Controls (keyboard only; no mouse)
- 6.1 Arrow keys move a cursor over the grid cells (up/down/left/right).
- 6.2 SPACE selects the gem under the cursor (gem A); the selection is highlighted.
- 6.3 After a selection, an arrow key toward an orthogonally-adjacent cell
  designates the swap target (gem B) and highlights it.
- 6.4 A second SPACE commits the swap of A and B.
  - 6.4.1 If SPACE is pressed again while a gem is selected but no adjacent target
    has been designated (the cursor has not been moved to an adjacent cell), the
    selection is left unchanged — pressing SPACE on the already-selected gem does
    NOT cancel it. A selection is cancelled only by ESC (6.6) or by committing an
    invalid swap (6.5).
- 6.5 The swap is applied only if it produces at least one match of 3+; otherwise
  the swap is reverted and the selection is cancelled (an invalid move cancels).
- 6.6 ESC cancels the current selection at any point.
- 6.7 Pressing A toggles autoplay on/off (see §12).

## 7. Resolution loop
- 7.1 On a committed valid swap, all matched runs clear.
- 7.2 Gems above a cleared cell fall down to fill the gap (gravity).
- 7.3 New random gems drop in from the top to refill empty cells.
- 7.4 Any new matches created by falling/refilling clear in turn (cascade), until
  the board is stable.

## 8. Endless play
- 8.1 The game keeps a running score (see §10). Scoring is purely additive — it
  does not change how the game ends.
- 8.2 The game runs infinitely; there is no game-over.
- 8.3 If the board ever reaches a state with no possible valid move, the game does
  NOT reshuffle the whole board. Instead it revives play by changing a SINGLE gem to
  a type that creates at least one possible valid move. For example, in a line
  reading `X X Y Z`, changing the `Z` to an `X` gives `X X Y X`, from which one swap
  brings three `X`s together. After the change at least one valid move exists, so
  play never dead-ends (8.2).
  - 8.3.1 The single changed cell is highlighted so the player can see what changed:
    the new gem briefly spins in place, cycling through its rotation frames (the
    per-gem rotation sprites bundled with the game), then comes to rest static like
    the other gems.
  - 8.3.2 In the rare case where no single-gem change can create a valid move, the
    game changes the fewest additional gems needed to guarantee one. A whole-board
    reshuffle is never used.

## 9. Visual effects
- 9.1 Gems are rendered from their sprite images; there is no neon glow — the
  glossy sprite art carries the visual weight on its own. Gems rest completely
  still: they do not rotate or animate while sitting on the board — each shows a
  single fixed, face-on view.
- 9.2 When gems are removed (each time a row or column run is completed and
  cleared), every removed gem plays a shatter effect and breaks apart. The effect
  must be visually appealing.
  - 9.2.1 The break is varied: gems do not all shatter identically — each break
    differs (e.g. randomised fragment paths / spread), so repeated clears never
    look the same.
  - 9.2.2 The fragments are pieces cut from the broken gem's own sprite image — the
    gem appears to break apart into shards of itself. The pieces fall down the
    screen, drifting somewhat randomly, and disappear once they pass beyond the
    lower border of the screen.
  - 9.2.3 The shatter effect applies ONLY to gems that are removed as part of a
    completed match (the cleared run). Gems that merely fall to fill gaps (7.2) or
    drop in to refill from the top (7.3) do NOT shatter — they simply move into
    place.
- 9.3 Animated transitions — the swap, gems falling/refilling (7.2, 7.3), and the
  shatter — play at a slow, deliberate pace, noticeably slower than an instant
  snap, so the motion is clearly visible and appealing.
- 9.4 All on-screen text in the game — the score and any other UI text (e.g. future
  player names, timers, and result banners) — is rendered in the "Press Start 2P"
  arcade pixel font, which ships bundled with the game (SIL Open Font License). This
  is the game's one display typeface, for a consistent retro look.

## 10. Scoring
The game keeps a running score that only ever increases. It rewards clearing gems
quickly and in bigger, chained clears.

- 10.1 The score starts at 0 and is displayed at the top of the gem grid,
  left-aligned, rendered in the "Press Start 2P" arcade pixel font, which ships
  bundled with the game (SIL Open Font License).
- 10.2 A **completion** is a single resolution step in which one or more matched
  runs clear at the same time.
- 10.3 Base points for one cleared run = (run length − 2) × 50. So a 3-run = 50,
  a 4-run = 100, a 5-run = 150, and so on.
- 10.4 When several runs clear in the same completion (10.2), their base points are
  summed before any multiplier is applied.
- 10.5 A time multiplier rewards fast play. It resets to 100 at each completion and
  then counts down by 1 every second, never below 0. At the moment of a completion
  its value is `100 − (whole seconds elapsed since the previous completion)`,
  floored at 0. For the first completion of the game the elapsed time is measured
  from the start of play.
- 10.6 A combo factor rewards chains. Within the cascade chain triggered by one
  swap (7.4), the k-th completion carries a factor of 2^(k−1): the 1st completion
  ×1, the 2nd ×2, the 3rd ×4, the 4th ×8, and so on. The chain index resets to 1
  on each new swap.
- 10.7 Each completion adds to the running score:
  `floor( summed_base (10.4) × time_multiplier (10.5) × combo_factor (10.6) / 100 )`.
  - 10.7.1 Worked examples: a lone 3-run 30 seconds after the previous completion
    scores `floor(50 × (100−30) × 1 / 100)` = 35. A 3-run and a 4-run clearing
    together, same 30-second gap, first in the chain: `floor((50+100) × 70 × 1
    / 100)` = 105.
  - 10.7.2 When the time multiplier (10.5) has reached 0, a completion adds
    nothing to the score: the player scores no points at all until the multiplier
    resets. This is a consequence of the formula in 10.7, not a separate rule.
    Everything else about the completion is unaffected — the runs still clear and
    the cascade still proceeds.
- 10.8 The current time multiplier (10.5) is shown at the top of the grid, to the
  right of the score, as a horizontal gradient bar that occupies ALL the remaining
  horizontal space from the score across to the grid's right border. Its filled
  length represents the multiplier as a fraction of its 100 maximum. The bar is full
  at 100 and, as the multiplier counts down toward 0, it empties from the RIGHT: the
  right end recedes leftward (it decreases right-to-left), so the remaining filled
  portion is anchored at the left edge and the last sliver to disappear is on the
  left. The bar is coloured with a green → yellow → red gradient. It is enclosed in
  a THICK WHITE box (border) around its full extent. The bar is sized to be clearly
  visible and prominent — a generous height, not a thin sliver.
- 10.9 The multiplier box (10.8) carries the label `Score multiplier: x###` in
  WHITE — that text and nothing more — where `###` is the current value of the time
  multiplier (10.5) with no padding, so `x100` at a fresh reset, `x7` near the end,
  `x0` at the floor.
  - 10.9.1 The number changes in step with the countdown (10.5), so the label and
    the bar's fill never disagree about the multiplier.
  - 10.9.2 The label is present at all times, including when the multiplier has
    reached 0.
  - 10.9.3 The text sits within the box, over the bar, and remains legible against
    the bar's gradient (10.8) at every fill level and at every point along the bar.

## 11. Sound
The game plays short sound effects that respond to what the player does and what
happens on the board.

- 11.1 All audio ships bundled with the game (self-contained folder, 1.3) and is
  public-domain / CC0-licensed — free to use and redistribute with no attribution
  required. A credits file records each sound's source and licence.
- 11.2 A short sound effect plays on each of these events:
  - 11.2.1 Cursor move (a subtle tick as the cursor moves between cells).
  - 11.2.2 Gem select (a soft confirm when SPACE selects a gem).
  - 11.2.3 Valid swap (two gems trading places).
  - 11.2.4 Invalid swap / revert (a gentle negative tone when a swap makes no match
    and is undone).
  - 11.2.5 Match clear / shatter (a satisfying glassy break when a run clears — the
    core feedback).
  - 11.2.6 Cascade step (a tone for chained clears that rises in pitch as the chain
    deepens, mirroring the escalating combo of 10.6).
  - 11.2.7 Gems falling into place (a soft drop as gems settle after a clear).
  - 11.2.8 Auto-reshuffle (a shuffle/whoosh when the board reshuffles, 8.3).
  - 11.2.9 Score award (a reward chime when points are added).
- 11.3 Audio must not block play: browsers that suspend audio until the first user
  interaction are accommodated (sound begins once the player first acts), and the
  game remains fully playable with no sound if audio is unavailable.
- 11.4 There is no background music track (sound effects only) in this version.
- 11.5 Pressing the S key toggles all audio on/off. When off, no sounds play; when
  toggled back on, sounds resume. Audio defaults to on.
  - 11.5.1 Each time audio is toggled, a large WHITE text — "Sound ON" or "Sound
    OFF" to match the new state — briefly appears centred on the screen and then
    fades away, in the game's display font (9.4). The text is very large and
    prominent (about three times the size of an ordinary UI label), dominating the
    centre of the screen while it shows.
- 11.6 An instruction line is shown at the bottom of the gem grid stating that S
  toggles audio on/off, rendered in the game's display font (9.4).

## 12. Autoplay
A hands-off demo mode in which the game plays itself.

- 12.1 Pressing the A key toggles autoplay on/off; it defaults to off. An
  instruction line at the bottom of the gem grid states that A toggles autoplay,
  shown alongside the audio hint (11.6), in the game's display font (9.4).
- 12.2 While autoplay is ON, the game plays itself by emulating a player: it moves
  the cursor to a gem, selects it (6.2), designates an orthogonally-adjacent gem
  (6.3), and commits a swap (6.4) that completes a match. It only makes valid moves
  that create a run of 3+ (6.5), so runs clear and play keeps progressing — there is
  always at least one valid move available (8.3). The emulated actions run faster
  than manual play but at a brisk, MODERATE, easy-to-follow pace — clearly quicker
  than manual play, not a frantic blur (the exact pace is a tuning choice, adjusted
  by feel). Board transitions may play somewhat faster than the deliberate 9.3 pace
  during autoplay. It stays coherent — real valid moves, not frozen or skipped.
- 12.3 While autoplay is ON, the game ignores normal player input — cursor
  movement, selection, swap-target designation, and cancel are not acted on.
  Pressing A again turns autoplay OFF and returns control to the player.
- 12.4 While autoplay is ON, a blinking "Autoplaying..." indicator is shown centred
  at the top of the grid (above the score), in the game's display font (9.4). It
  disappears when autoplay is turned off.
