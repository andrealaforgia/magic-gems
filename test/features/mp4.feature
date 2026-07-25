Feature: Live opponent sync during the match (MP4)
  As two players in a match
  I want to see my opponent's board and score update as they actually play
  So the match feels genuinely live, not frozen at the starting board

  @E1 @E2 @integration
  Scenario: Each client's remote side eventually reflects the opponent's real board and score, in both directions
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    Given I locate an adjacent swap that would produce a match on the first page's local match board
    When I commit that swap on the first page's local match board
    Then the first page's local match score has increased
    And the second page's remote match board and score eventually reflect the first page's own local board and score
    Given I locate an adjacent swap that would produce a match on the second page's local match board
    When I commit that swap on the second page's local match board
    Then the second page's local match score has increased
    And the first page's remote match board and score eventually reflect the second page's own local board and score

  @E3 @integration
  Scenario: The centre gauge tilts toward whoever currently leads on score, on both clients
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    Given I locate an adjacent swap that would produce a match on the first page's local match board
    When I commit that swap on the first page's local match board
    Then the first page's local match score has increased
    And the first page's own match gauge eventually shows the first page's own player leading
    And the second page's own match gauge eventually shows the first page's own player leading

  @E4 @integration
  Scenario: A slow, failing sync channel never blocks or delays local play
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    Given the first page's session network requests are now slow and failing
    And I locate an adjacent swap that would produce a match on the first page's local match board
    When I commit that swap on the first page's local match board
    Then the first page's local match score has increased within a normal, short amount of time

  @E5
  Scenario: Single-player and the start screen are unaffected by live opponent sync
    Given I open "index.html" at the raw start screen, with no mode chosen yet
    Then the start screen offers "Single-player" and "Multiplayer" in the pixel font
    When I choose "Single-player" from the start screen
    Then the game board is shown
  # The full single-player play loop itself is already proven by mp1.feature's
  # own E2/E4 and game-match-loop.feature - not re-derived here.

  @E1 @E3 @E4 @E6 @integration
  Scenario: Two real clients see each other's live moves and a shifting gauge, even while one client's sync channel is degraded throughout
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    Given the first page's session network requests are now slow
    And I locate an adjacent swap that would produce a match on the first page's local match board
    When I commit that swap on the first page's local match board
    Then the first page's local match score has increased within a normal, short amount of time
    And the second page's remote match board and score eventually reflect the first page's own local board and score
    And the first page's own match gauge eventually shows the first page's own player leading
    And the second page's own match gauge eventually shows the first page's own player leading
    Given I locate an adjacent swap that would produce a match on the second page's local match board
    When I commit that swap on the second page's local match board
    Then the second page's local match score has increased
    And the first page's remote match board and score eventually reflect the second page's own local board and score
