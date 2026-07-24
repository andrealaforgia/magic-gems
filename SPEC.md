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
- 6.5 The swap is applied only if it produces at least one match of 3+; otherwise
  the swap is reverted and the selection is cancelled (an invalid move cancels).
- 6.6 ESC cancels the current selection at any point.

## 7. Resolution loop
- 7.1 On a committed valid swap, all matched runs clear.
- 7.2 Gems above a cleared cell fall down to fill the gap (gravity).
- 7.3 New random gems drop in from the top to refill empty cells.
- 7.4 Any new matches created by falling/refilling clear in turn (cascade), until
  the board is stable.

## 8. Endless play
- 8.1 There is no score.
- 8.2 The game runs infinitely; there is no game-over.
- 8.3 If the board ever has no possible valid move, it auto-reshuffles, guaranteeing
  at least one possible match, so play never dead-ends.

## 9. Visual effects
- 9.1 Gems are rendered from their sprite images; there is no neon glow — the
  glossy sprite art carries the visual weight on its own.
  - 9.1.1 Each gem continuously spins in place — a rapid, energetic idle rotation
    through its full turn, roughly one complete rotation every 0.45 seconds — while
    it rests on the board. Gems are not all in lockstep: their rotations are out of
    phase, so the board shimmers rather than pulsing as one. (This idle-spin pace is
    deliberately quicker than the slow transition pace of 9.3.)
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
