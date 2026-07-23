Feature: Neon board renders (B1)
  As a player opening Magic Gems for the first time
  I want the board to render as a complete, randomized, glowing 8x8 grid
  So that I see a coherent playfield the moment the page loads

  @E1
  Scenario: Opens directly in a browser with no build step
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the page renders an HTML5 canvas element for the board
    And no console errors were raised while loading
    # Evidence (examiner-verified 2026-07-23, re-run independently of the Builder's report):
    #   $ npx cucumber-js --config test/features/cucumber.mjs --name "Opens directly"
    #   Playwright opened index.html via a real file:// URL (classic <script> tags,
    #   no module/CORS issue). document.getElementById('board').tagName === 'CANVAS';
    #   zero page/console errors captured during load. Scenario passed.

  @E2
  Scenario: The board is an 8x8 grid centered on screen
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the canvas represents an 8 by 8 grid of 64 cells
    And the canvas is positioned in the central part of the viewport
    # Evidence: independent column/row blob counts from real canvas pixel data
    # (getImageData scanlines, not the size constants) returned columns=8, rows=8.
    # Canvas bounding-box center measured within 10% of the viewport center. Passed.

  @E3
  Scenario: Every cell holds exactly one gem
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then all 64 cells contain exactly one recognizable gem colour each
    # Evidence: sampled all 64 cell-center pixels via getImageData; every one
    # classified to a known gem colour in the live palette (window.MagicGems.GEM_COLORS),
    # none background/empty. Passed.

  @E4 @E5
  Scenario Outline: Each gem type is a distinguishable neon-glowing shape
    Given a single "<gem>" gem is drawn in isolation
    Then it is rendered as a "<shape>" filled with its own distinct colour
    And a soft glow halo fades outward from its edge, not a flat cutoff
    # Evidence: each of the 6 gems drawn in isolation on test/features/support/render-probe.html
    # (loads the real src/gems.js + src/render.js unmodified). Centre pixel matched the gem's
    # own palette colour (distance < 20). Luma scan along the gem's ray showed a >=6px gradual
    # fade from core to background for every gem — a measured glow, not a hard-edge cutoff.

    Examples:
      | gem             | shape    |
      | purple-triangle | triangle |
      | red-square      | square   |
      | green-circle    | circle   |
      | yellow-diamond  | diamond  |
      | blue-diamond    | diamond  |
      | white-circle    | circle   |

  @E4
  Scenario: All six gem types appear on the board and are distinguishable from one another
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the board's 64 cells show gem colours that map to all six known gem types
    # Evidence — real classified board from one live run (examiner-reproduced, own run
    # differed from the Builder's sample as expected of a random board, still 6/6 distinct):
    #   PT=purple-triangle RS=red-square GC=green-circle YD=yellow-diamond
    #   BD=blue-diamond   WC=white-circle
    # classifyGem() over all 64 live cells returned exactly 6 distinct labels. Passed.

  @E6
  Scenario: The initial arrangement is randomized and match-free
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    When I open "index.html" again as a fresh file:// page load
    Then the new arrangement differs from the previous one
    # Evidence: hasRunOf3() over the classified live grid found no 3+ run horizontally
    # or vertically. A real page.reload() (fresh file:// load, not a re-render call)
    # produced a classified grid that differs from the pre-reload one. Passed.

  @E7
  Scenario: No interactivity beyond the static render
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I capture the rendered board as a snapshot
    When I press the arrow keys, SPACE, and ESC
    Then the rendered board is pixel-identical to the snapshot
    # Evidence: canvas.toDataURL() snapshot taken, then real keyboard events
    # (ArrowUp/Down/Left/Right, Space, Escape) dispatched via Playwright against the
    # live page; src/main.js registers no key listeners, so the re-captured dataURL
    # was byte-identical to the snapshot. Passed.

  @E8
  Scenario: A single fresh load produces one coherent result end to end
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the page renders an HTML5 canvas element for the board
    And the canvas represents an 8 by 8 grid of 64 cells
    And the canvas is positioned in the central part of the viewport
    And all 64 cells contain exactly one recognizable gem colour each
    And the board's 64 cells show gem colours that map to all six known gem types
    And the board contains no horizontal or vertical run of 3 or more identical gems
    And I capture the rendered board as a snapshot
    When I press the arrow keys, SPACE, and ESC
    Then the rendered board is pixel-identical to the snapshot
    # Evidence: all of the above checks chained inside one single fresh file:// load —
    # canvas present, 8x8, centered, 64/64 cells filled, 6/6 gem types, no pre-existing
    # match, no reaction to input — proving the coherent whole, not isolated parts.
    #
    # Examiner verification (2026-07-23): re-ran `npm test` independently —
    #   node --test "test/unit/**/*.test.js"  -> 6 tests, 6 pass, 0 fail
    #   cucumber-js --config test/features/cucumber.mjs -> 13 scenarios (13 passed), 46 steps (46 passed)
    # Step definitions drive the real file:// page and probe HTML via Playwright/Chromium
    # (getImageData/toDataURL/keyboard events against the live DOM) — no mocks. Committed
    # implementation: 5b0e7db.
