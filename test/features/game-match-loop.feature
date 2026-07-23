Feature: The core match-3 play loop (B3)
  As a player
  I want committing a matching swap to clear it and refill the board, a non-matching
  swap to revert cleanly, and the game to keep going forever
  So that I can actually play, not just look at and navigate the board

  @E1
  Scenario: A second SPACE commits a match-producing swap, which clears the match
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems

  @E4
  Scenario: After a match-producing swap settles, gravity and refill leave every cell populated
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    Then all 64 cells contain exactly one recognizable gem colour each

  @E5
  Scenario: After committing a match-producing swap, the selection and target highlights are cleared
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    Then no selection or target highlight is present

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

  # E9 ("every previous rendering guarantee still holds after a swap settles")
  # retired per QA test-design review (commit 034b6bf, Farley Index 7.9): its 4
  # assertions - canvas 8x8/64 cells, canvas centered, all cells populated, all six
  # gem types present - wholesale duplicate board-renders.feature's own atomic
  # E2/E3/E4 scenarios (and its E8 integration), and the "populated" claim is now
  # also covered by this file's own E4 above. None of these render properties have
  # any code path by which a swap/animation could plausibly change them (canvas
  # size/position are set once at boot and never touched again) - the "after a
  # swap" framing wasn't testing anything a fresh-load check couldn't already
  # prove. Retired rather than re-tagged, per the same reasoning already applied
  # to board-sizing.feature's B1s-E6.

  # E10 (integration) composes two flows E1/E4/E5 (now three atomic scenarios) and
  # E2 already each prove atomically: a match settles, then a later non-match
  # reverts. Trimmed to its final checkpoint per flow rather than re-asserting
  # every intermediate check those scenarios already cover - what's actually new
  # here is that both flows compose correctly back to back in one continuous
  # session, not either flow in isolation.
  @E10 @integration
  Scenario: One continuous session - match swap settles, then a non-match swap reverts
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    Given I record the classified gem grid
    And I locate an adjacent swap that would not produce a match on the live board
    When I commit that swap
    Then the classified gem grid is unchanged from the recorded one
    And no selection or target highlight is present
