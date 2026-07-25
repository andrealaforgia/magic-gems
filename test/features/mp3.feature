Feature: The match begins split-screen once both players are ready (MP3)
  As two players who just joined the same session
  I want the match to begin automatically, split-screen, with a countdown and score gauge
  So we can immediately start playing on equal footing

  @E1 @E2 @E8 @integration
  Scenario: Two independent clients reach ready, the match begins on both with identical starting boards
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then both pages reach the ready state showing "Alice & Bob"
    And the match begins on both pages
    And both pages show byte-for-byte identical starting boards

  @E4
  Scenario: The match splits into local (left) and remote (right) grids with names and score
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    Then the first page's match shows "Alice" as the local player with a score, and "Bob" as the remote player

  @E5
  Scenario: The centre shows a counting-down timer and a tug-of-war gauge, in the pixel font
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    Then the first page's match timer reads 10:00 or just under, in the pixel font
    And the first page's match gauge is evenly split at the start
    And the match timer on the first page visibly counts down over real time

  @E6 @integration
  Scenario: The local grid responds to real keyboard controls and resolves a match
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    Given I locate an adjacent swap that would produce a match on the first page's local match board
    When I commit that swap on the first page's local match board
    Then the first page's local match score has increased

  # E3 (refills after a clear draw from the same seeded sequence on both
  # clients) is proven at the unit level (test/unit/seeded-board.test.js),
  # which pins the exact same move sequence onto two independently-seeded
  # board copies and confirms identical refills. A live two-client version
  # would require synchronizing the exact same move at the exact same instant
  # on two real, independently-timed browsers - proving nothing beyond what
  # the unit test already does, while adding real timing flakiness for no
  # extra confidence.

  @E7
  Scenario: Single-player and the start screen are unchanged by the match
    Given I open "index.html" at the raw start screen, with no mode chosen yet
    Then the start screen offers "Single-player" and "Multiplayer" in the pixel font
    When I choose "Single-player" from the start screen
    Then the game board is shown
  # The full single-player play loop itself is already proven by mp1.feature's
  # own E2/E4 and game-match-loop.feature - not re-derived here.
