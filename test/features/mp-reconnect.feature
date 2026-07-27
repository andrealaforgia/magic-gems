Feature: A player can rejoin their own session (MP-RECONNECT)
  As a player whose connection or browser tab drops mid-session
  I want to get back into the same session under my own name
  So a dropped connection doesn't lock me out of a match I'm already part of

  @E1 @E4 @integration
  Scenario: A player who left reclaims their place instead of being told the session is full
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then both pages reach the ready state showing "Alice & Bob"
    When a new page enters the lobby, types the name "Bob", and enters that same code
    Then that new page also reaches the ready state showing "Alice & Bob"

  @E2 @E4 @integration
  Scenario: A genuinely new third player is still told the session is full
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then both pages reach the ready state showing "Alice & Bob"
    When a new page enters the lobby, types the name "Carol", and enters that same code
    Then that new page reports the session is full

  @E3
  Scenario: Creating a fresh session and a normal join by a genuinely new name are unaffected
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Dave" and generates a code
    And the second page enters the name "Erin" and enters that same code
    Then both pages reach the ready state showing "Dave & Erin"

  # MP-REPLICA-ASYMMETRY (RE-OPEN): a player whose page reloads MID-MATCH
  # (not just in the lobby) reconnects fine at the session level (E1 above),
  # but the match view itself used to silently reset to the starting board
  # and zero score - losing the reconnecting player's own real progress, and
  # permanently desyncing the OPPONENT's own replica of them, since the
  # opponent's replica never resets and the reconnecting player's own future
  # moves were computed against a board the opponent no longer shared.
  @E5 @integration
  Scenario: A player who reloads mid-match keeps their own real progress, and the opponent's own faithful view of them survives it
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    Given I locate an adjacent swap that would produce a match on the first page's local match board
    When I commit that swap on the first page's local match board
    Then the first page's local match score has increased
    And the second page's remote match board and score eventually reflect the first page's own local board and score
    Given I record the first page's own local match score
    When the first page reloads mid-match and reconnects
    Then the first page's own local match score is close to what was recorded before, not reset to zero
    When I press "a" on the first page
    And I press "a" on the second page
    Then the second page's remote match board and score eventually reflect the first page's own local board and score
