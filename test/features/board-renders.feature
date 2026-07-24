Feature: Board renders (B1)
  As a player opening Magic Gems for the first time
  I want the board to render as a complete, randomized 8x8 grid
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

  # E4/E5 ("each gem type is a distinguishable neon-glowing shape", tested via
  # isolated vector-path/glow probes) and the "all six gem types" scenario below it
  # are both retired per SG1 (sprite re-skin, commit history around SPEC 2/9.1):
  # gems are no longer vector-drawn shapes with a neon glow, so shape/glow probing
  # no longer applies, and the type count changed from six to seven. SG1's own
  # feature file (test/features/sprite-reskin.feature) owns the current
  # distinguishability and exact-identity-count claims; retired here rather than
  # perpetually updated, per the same reasoning already applied to this file's own
  # E7/E8 below.

  @E6
  Scenario: The initial arrangement is randomized and match-free
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    When I open "index.html" again as a fresh file:// page load
    Then the new arrangement differs from the previous one

  # E7 ("no interactivity beyond the static render") was B1's boundary before any
  # interaction behaviour existed. B2 (test/features/board-navigate-select.feature)
  # supersedes it with the precise boundary that actually matters: cursor/selection/
  # target highlighting may change the canvas, but the board's 64 gems never do
  # (B2 @E9/@E10). Retired here rather than left failing against real interactivity.

  # E8 ("a single fresh load produces one coherent result end to end") retired per
  # QA test-design review (commit 59d95e8, Farley Index 8.0): its 5 assertions
  # wholesale duplicated this file's own E1/E2/E3/E4/E6 atomic scenarios verbatim,
  # from a single page load with no distinct sequenced actions to compose - unlike
  # the E10/E8 integration scenarios elsewhere in this suite, there was no
  # cross-time claim left to justify keeping it. Retired rather than re-tagged,
  # per the same reasoning already applied to board-sizing.feature's B1s-E6 and
  # game-match-loop.feature's E9.
