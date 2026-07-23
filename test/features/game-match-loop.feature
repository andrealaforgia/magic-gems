Feature: The core match-3 play loop (B3)
  As a player
  I want committing a matching swap to clear it and refill the board, a non-matching
  swap to revert cleanly, and the game to keep going forever
  So that I can actually play, not just look at and navigate the board

  @E1 @E4 @E5
  Scenario: A second SPACE commits a match-producing swap, which clears, falls, refills, and cascades to a stable board
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    And all 64 cells contain exactly one recognizable gem colour each
    And no selection or target highlight is present

  @E2
  Scenario: A second SPACE with a non-match swap reverts the board and cancels the selection
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I record the classified gem grid
    And I locate an adjacent swap that would not produce a match on the live board
    When I commit that swap
    Then the classified gem grid is unchanged from the recorded one
    And no selection or target highlight is present

  @E3
  Scenario: ESC cancels the selection at any point before commit without mutating the board
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I record the classified gem grid
    When I press "ArrowRight"
    And I press "Space"
    And I press "ArrowDown"
    And I press "Escape"
    Then the classified gem grid is unchanged from the recorded one
    And no selection or target highlight is present

  @E6
  Scenario: No score or counter is ever displayed, before or after a swap
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the page shows no score or counter element
    When I locate an adjacent swap that would produce a match on the live board
    And I commit that swap
    Then the page shows no score or counter element

  @E7
  Scenario: After a cascade settles, the board accepts another swap - no game-over state
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    And I locate an adjacent swap that would produce a match on the live board
    And I commit that swap
    And the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    And all 64 cells contain exactly one recognizable gem colour each

  @E8
  Scenario: A board with no valid moves automatically reshuffles into a playable arrangement
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I apply the live page's own ensurePlayable to a known stuck board
    Then the reshuffled result has no pre-existing match
    And the reshuffled result has at least one valid move

  @E9
  Scenario: Every previous rendering guarantee still holds after a swap settles
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    Then the canvas represents an 8 by 8 grid of 64 cells
    And the canvas is positioned in the central part of the viewport
    And all 64 cells contain exactly one recognizable gem colour each
    And the board's 64 cells show gem colours that map to all six known gem types

  @E10 @integration
  Scenario: One continuous session - match swap settles, then a non-match swap reverts
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    And all 64 cells contain exactly one recognizable gem colour each
    And no selection or target highlight is present
    Given I record the classified gem grid
    And I locate an adjacent swap that would not produce a match on the live board
    When I commit that swap
    Then the classified gem grid is unchanged from the recorded one
    And no selection or target highlight is present
