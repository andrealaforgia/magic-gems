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
Six distinct gem types, each a geometric shape drawn with a neon glow effect:
- 2.1 Purple triangle, pointing up.
- 2.2 Red square.
- 2.3 Green circle.
- 2.4 Yellow diamond.
- 2.5 Blue diamond, pointing down (visually distinct from the yellow diamond).
- 2.6 White circle (visually distinct from the green circle).
- 2.7 A gem's identity is the (shape + colour) pair; the six pairs above are the
  only gem types. Future sprites may replace the shapes without changing identity.

## 3. The board & layout
- 3.1 The playfield is an 8×8 grid of gems.
- 3.2 The board occupies the central part of the screen.

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
- 9.1 Gems are rendered with a neon effect (glow).
- 9.2 When gems are removed, a shatter effect plays: pixels representing the broken
  gem fall downward.
