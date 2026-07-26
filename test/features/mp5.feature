Feature: End of match & winner (MP5)
  As two players in a match
  I want the match to end and proclaim a winner, by surrender or by the clock
  So a match reaches a real conclusion, not just an indefinite grid session

  @E1 @E2 @E3 @integration
  Scenario: Surrendering ends the match on both clients, with the winner correctly proclaimed on each
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    When I press "Escape" on the second page
    And I press "y" on the second page
    Then the first page's match result eventually shows "YOU WIN!"
    And the second page's match result eventually shows "YOU LOSE"

  @E4 @E5 @integration
  Scenario: The countdown reaching 0:00 ends the match on both clients, with the higher scorer correctly proclaimed the winner on each
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    Given I locate an adjacent swap that would produce a match on the first page's local match board
    When I commit that swap on the first page's local match board
    Then the first page's local match score has increased
    And the second page's remote match board and score eventually reflect the first page's own local board and score
    When both pages' match clocks are fast-forwarded to just past 0:00
    Then the first page's match result eventually shows "YOU WIN!"
    And the second page's match result eventually shows "YOU LOSE"

  # QA review (commit e6e6715): the implementation calls endMatch('lose')
  # unconditionally, not gated on the surrender request's own network
  # response - but that was only inference from reading the code. This
  # proves it, mirroring mp4.feature's own E6 "slow and failing channel
  # never blocks local play" pattern against the surrender action instead.
  @E1 @E6 @integration
  Scenario: Surrendering under a slow, failing sync channel still ends the surrendering client's own match promptly
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    Given the second page's session network requests are now slow and failing
    When I press "Escape" on the second page
    And I press "y" on the second page
    Then the second page's match result eventually shows "YOU LOSE" within a normal, short amount of time

  @E4 @E5 @integration
  Scenario: A match tied on score at 0:00 ends in a draw on both clients
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    When both pages' match clocks are fast-forwarded to just past 0:00
    Then the first page's match result eventually shows "DRAW"
    And the second page's match result eventually shows "DRAW"

  @E6
  Scenario: Single-player's own ESC-exit is unaffected - no surrender or winner concept
    Given I open "index.html" at the raw start screen, with no mode chosen yet
    When I choose "Single-player" from the start screen
    Then the game board is shown
    When I press "Escape"
    Then the exit confirmation overlay is shown, reading exactly "Are you sure you want to exit the game? Y/N", centred, in the pixel font
    When I press "y"
    Then the start screen is shown again
    And no match result screen is ever shown
  # The full single-player exit-confirm behaviour itself is already proven by
  # exit-confirm.feature - only "no surrender/winner concept leaked in" is
  # the new claim here.
