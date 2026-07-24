# Magic Gems

A keyboard-controlled, Bejeweled-style match-3 game that runs in the browser.
No build step, no runtime dependencies — it's plain HTML, CSS, and JavaScript
drawn on an HTML5 canvas.

![Magic Gems](https://img.shields.io/badge/status-feature--complete-brightgreen)

## How to run

Just open `index.html` in a modern browser.

```sh
# macOS
open index.html

# Linux
xdg-open index.html

# Windows
start index.html
```

That's it — there is nothing to install or build.

> Tip: you can also serve the folder over HTTP if you prefer
> (`python3 -m http.server`) and visit `http://localhost:8000`, but opening the
> file directly works fine.

## How to play

The game is controlled entirely with the **keyboard** (no mouse).

| Key | Action |
| --- | --- |
| **Arrow keys** | Move the cursor around the 8×8 board |
| **SPACE** | Select the gem under the cursor (it highlights) |
| **Arrow** (after selecting) | Aim at an orthogonally-adjacent gem — the swap target highlights |
| **SPACE** (again) | Swap the two gems **if** it forms a match of 3+; otherwise the swap reverts and the selection cancels |
| **ESC** | Cancel the current selection |

### Rules

- A **match** is a straight run of 3 or more identical gems, horizontal or vertical.
- Matched gems **shatter** and clear; gems above **fall** to fill the gaps and new
  gems **drop in** from the top; any new matches **cascade** until the board settles.
- The game keeps a running **score** (shown above the board, along with the current
  time multiplier) that rewards fast, big, and chained clears — but there is
  **no game-over**; the game runs forever. If the board ever has no possible move,
  it **reshuffles** into a playable layout.

### The gems

Seven types, each a glossy, faceted gemstone sprite: blue teardrop, green octagon,
orange hexagon, purple triangle, red square, silver octagon, and yellow diamond.

## Project layout

| Path | What it is |
| --- | --- |
| `index.html` | Entry point — the game canvas |
| `styles.css` | Page layout and background |
| `src/` | Game logic (board, gems, rendering, interaction) |
| `assets/gems/` | Sprite art, one folder per gem identity |
| `SPEC.md` | The frozen, normative specification |
| `test/` | Unit tests and Cucumber/Playwright acceptance tests |

## Development

The shipped game needs no tooling, but the test suite does. Install dev
dependencies once:

```sh
npm install
```

Then:

```sh
npm run test:unit        # fast unit tests (node --test)
npm run test:acceptance  # BDD acceptance tests (Cucumber + Playwright)
npm test                 # both
```
