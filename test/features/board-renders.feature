Feature: Neon board renders (B1)
  As a player opening Magic Gems for the first time
  I want the board to render as a complete, randomized, glowing 8x8 grid
  So that I see a coherent playfield the moment the page loads

  @E1
  Scenario: Opens directly in a browser with no build step
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the page renders an HTML5 canvas element for the board
    And no console errors were raised while loading

  @E2
  Scenario: The board is an 8x8 grid centered on screen
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the canvas represents an 8 by 8 grid of 64 cells
    And the canvas is positioned in the central part of the viewport

  @E3
  Scenario: Every cell holds exactly one gem
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then all 64 cells contain exactly one recognizable gem colour each

  @E4 @E5
  Scenario Outline: Each gem type is a distinguishable neon-glowing shape
    Given a single "<gem>" gem is drawn in isolation
    Then it is rendered as a "<shape>" filled with its own distinct colour
    And a soft glow halo fades outward from its edge, not a flat cutoff

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

  @E6
  Scenario: The initial arrangement is randomized and match-free
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    When I open "index.html" again as a fresh file:// page load
    Then the new arrangement differs from the previous one

  @E7
  Scenario: No interactivity beyond the static render
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I capture the rendered board as a snapshot
    When I press the arrow keys, SPACE, and ESC
    Then the rendered board is pixel-identical to the snapshot

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
